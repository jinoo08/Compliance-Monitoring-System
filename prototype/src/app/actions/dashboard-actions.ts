"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { computeDueDateFromRecurrence, sanitizeFileName } from "@/lib/utils";
import type { Profile, Recurrence, TaskStatus, UserRole } from "@/lib/types";

const dashboardPath = "/dashboard";

const redirectWithMessage = (kind: "error" | "success", message: string) => {
  redirect(`${dashboardPath}?${kind}=${encodeURIComponent(message)}`);
};

const readRequired = (value: FormDataEntryValue | null, fieldName: string) => {
  const normalized = value?.toString().trim();
  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }
  return normalized;
};

const ensureAuthenticatedUser = async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login?error=Please sign in first.");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, section_id, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profileData) {
    redirect("/login?error=Profile not found. Contact an admin.");
  }

  const profile = profileData as Profile;

  if (!profile.is_active) {
    await supabase.auth.signOut();
    redirect("/login?error=Your account is inactive.");
  }

  return { supabase, user, profile };
};

const ensureAdmin = async () => {
  const sessionData = await ensureAuthenticatedUser();
  if (sessionData.profile.role !== "admin") {
    redirectWithMessage("error", "Admin access is required for this action.");
  }
  return sessionData;
};

const parseRole = (value: string): UserRole => {
  if (value === "admin" || value === "user") {
    return value;
  }
  throw new Error("Invalid role selected.");
};

const parseRecurrence = (value: string): Recurrence => {
  if (
    value === "none" ||
    value === "daily" ||
    value === "weekly" ||
    value === "monthly"
  ) {
    return value;
  }
  throw new Error("Invalid recurrence selected.");
};

const parseTaskStatus = (value: string): TaskStatus => {
  if (
    value === "pending" ||
    value === "in_progress" ||
    value === "submitted" ||
    value === "completed" ||
    value === "approved" ||
    value === "disapproved" ||
    value === "overdue"
  ) {
    return value;
  }
  throw new Error("Invalid task status selected.");
};

const parseSectionId = (value: string) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error("Invalid section selected.");
  }
  return parsed;
};

const toErrorMessage = (error: unknown, fallback: string) => {
  if (isRedirectError(error)) {
    throw error;
  }

  return error instanceof Error ? error.message : fallback;
};

export async function createManagedUserAction(formData: FormData) {
  try {
    const { profile } = await ensureAdmin();
    const email = readRequired(formData.get("email"), "Email");
    const fullName = readRequired(formData.get("full_name"), "Full name");
    const password = readRequired(
      formData.get("temporary_password"),
      "Temporary password",
    );
    const role = parseRole(readRequired(formData.get("role"), "Role"));
    const sectionId = parseSectionId(
      readRequired(formData.get("section_id"), "Section"),
    );

    const adminClient = createSupabaseAdminClient();

    const { data: createdUser, error: createUserError } =
      await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

    if (createUserError || !createdUser.user) {
      throw new Error(createUserError?.message ?? "Failed to create user.");
    }

    const { error: profileUpdateError } = await adminClient
      .from("profiles")
      .update({
        full_name: fullName,
        role,
        section_id: sectionId,
        created_by: profile.id,
        is_active: true,
        removed_at: null,
      })
      .eq("id", createdUser.user.id);

    if (profileUpdateError) {
      throw new Error(profileUpdateError.message);
    }

    await adminClient.from("notifications").insert({
      recipient_user_id: createdUser.user.id,
      type: "general",
      title: "Account created",
      message:
        "Your account is ready. Sign in and update your password immediately.",
    });

    revalidatePath(dashboardPath);
    redirectWithMessage("success", `${fullName} was added successfully.`);
  } catch (error) {
    const message = toErrorMessage(error, "Unable to create user.");
    redirectWithMessage("error", message);
  }
}

export async function updateUserAssignmentAction(formData: FormData) {
  try {
    await ensureAdmin();
    const targetUserId = readRequired(formData.get("user_id"), "User");
    const role = parseRole(readRequired(formData.get("role"), "Role"));
    const sectionId = parseSectionId(
      readRequired(formData.get("section_id"), "Section"),
    );

    const adminClient = createSupabaseAdminClient();
    const { error } = await adminClient
      .from("profiles")
      .update({
        role,
        section_id: sectionId,
      })
      .eq("id", targetUserId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(dashboardPath);
    redirectWithMessage("success", "User assignment updated.");
  } catch (error) {
    const message = toErrorMessage(error, "Failed to update assignment.");
    redirectWithMessage("error", message);
  }
}

export async function deactivateUserAction(formData: FormData) {
  try {
    const { profile } = await ensureAdmin();
    const targetUserId = readRequired(formData.get("user_id"), "User");

    if (targetUserId === profile.id) {
      throw new Error("You cannot remove your own account.");
    }

    const adminClient = createSupabaseAdminClient();

    const { error } = await adminClient
      .from("profiles")
      .update({
        is_active: false,
        removed_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(dashboardPath);
    redirectWithMessage("success", "User has been removed (deactivated).");
  } catch (error) {
    const message = toErrorMessage(error, "Failed to remove user.");
    redirectWithMessage("error", message);
  }
}

export async function assignTaskToSectionAction(formData: FormData) {
  try {
    const { supabase, profile } = await ensureAdmin();
    const title = readRequired(formData.get("title"), "Title");
    const description = formData.get("description")?.toString().trim() || null;
    const recurrence = parseRecurrence(
      readRequired(formData.get("recurrence"), "Recurrence"),
    );
    const dueAtInput = formData.get("due_at")?.toString();
    const sectionId = parseSectionId(
      readRequired(formData.get("section_id"), "Section"),
    );

    const dueAt = dueAtInput ? new Date(dueAtInput).toISOString() : null;

    const { error } = await supabase.from("tasks").insert({
      title,
      description,
      created_by: profile.id,
      assignee_scope: "section",
      assignee_section_id: sectionId,
      recurrence,
      due_at: dueAt,
      notify_admin: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(dashboardPath);
    redirectWithMessage("success", "Task assigned to section.");
  } catch (error) {
    const message = toErrorMessage(error, "Failed to assign task.");
    redirectWithMessage("error", message);
  }
}

export async function assignSectionDefaultsAction(formData: FormData) {
  try {
    const { supabase, profile } = await ensureAdmin();
    const sectionId = parseSectionId(
      readRequired(formData.get("section_id"), "Section"),
    );

    const { data: templates, error: templatesError } = await supabase
      .from("compliance_templates")
      .select("id, title, description, recurrence")
      .eq("scope", "section")
      .eq("section_id", sectionId)
      .eq("is_active", true);

    if (templatesError) {
      throw new Error(templatesError.message);
    }

    if (!templates || templates.length === 0) {
      throw new Error("No active section templates found.");
    }

    const insertPayload = templates.map((template) => ({
      title: template.title,
      description: template.description,
      created_by: profile.id,
      assignee_scope: "section" as const,
      assignee_section_id: sectionId,
      recurrence: template.recurrence,
      due_at: computeDueDateFromRecurrence(template.recurrence as Recurrence),
      source_template_id: template.id,
    }));

    const { error } = await supabase.from("tasks").insert(insertPayload);
    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(dashboardPath);
    redirectWithMessage(
      "success",
      "Default daily/weekly/monthly compliances were assigned.",
    );
  } catch (error) {
    const message = toErrorMessage(error, "Failed to assign default compliances.");
    redirectWithMessage("error", message);
  }
}

export async function reviewSubmissionAction(formData: FormData) {
  try {
    const { supabase, profile } = await ensureAdmin();
    const submissionId = readRequired(formData.get("submission_id"), "Submission");
    const decision = readRequired(formData.get("decision"), "Decision");
    const feedback = formData.get("feedback")?.toString().trim() || null;

    if (decision !== "approved" && decision !== "disapproved") {
      throw new Error("Decision must be approved or disapproved.");
    }

    const { data: submission, error: submissionError } = await supabase
      .from("submissions")
      .select("id, task_id")
      .eq("id", submissionId)
      .single();

    if (submissionError || !submission) {
      throw new Error("Submission not found.");
    }

    const reviewedAt = new Date().toISOString();

    const { error: updateSubmissionError } = await supabase
      .from("submissions")
      .update({
        status: decision,
        feedback,
        reviewed_by: profile.id,
        reviewed_at: reviewedAt,
      })
      .eq("id", submission.id);

    if (updateSubmissionError) {
      throw new Error(updateSubmissionError.message);
    }

    const { error: updateTaskError } = await supabase
      .from("tasks")
      .update({
        status: decision,
        completed_at: decision === "approved" ? reviewedAt : null,
      })
      .eq("id", submission.task_id);

    if (updateTaskError) {
      throw new Error(updateTaskError.message);
    }

    revalidatePath(dashboardPath);
    redirectWithMessage("success", "Submission review was saved.");
  } catch (error) {
    const message = toErrorMessage(error, "Failed to review submission.");
    redirectWithMessage("error", message);
  }
}

export async function createSelfTaskAction(formData: FormData) {
  try {
    const { supabase, profile } = await ensureAuthenticatedUser();
    const title = readRequired(formData.get("title"), "Title");
    const description = formData.get("description")?.toString().trim() || null;
    const recurrence = parseRecurrence(
      readRequired(formData.get("recurrence"), "Recurrence"),
    );
    const dueAtInput = formData.get("due_at")?.toString();
    const notifyAdmin = formData.get("notify_admin")?.toString() === "on";

    const dueAt = dueAtInput ? new Date(dueAtInput).toISOString() : null;

    const { error } = await supabase.from("tasks").insert({
      title,
      description,
      created_by: profile.id,
      assignee_scope: "user",
      assignee_user_id: profile.id,
      recurrence,
      due_at: dueAt,
      notify_admin: notifyAdmin,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(dashboardPath);
    redirectWithMessage("success", "Compliance task created.");
  } catch (error) {
    const message = toErrorMessage(error, "Failed to create compliance.");
    redirectWithMessage("error", message);
  }
}

export async function createUserTemplateAction(formData: FormData) {
  try {
    const { supabase, profile } = await ensureAuthenticatedUser();
    const title = readRequired(formData.get("title"), "Template title");
    const description = formData.get("description")?.toString().trim() || null;
    const recurrence = parseRecurrence(
      readRequired(formData.get("recurrence"), "Recurrence"),
    );

    if (recurrence === "none") {
      throw new Error(
        "Default compliances must use daily, weekly, or monthly recurrence.",
      );
    }

    const { error } = await supabase.from("compliance_templates").insert({
      title,
      description,
      recurrence,
      scope: "user",
      owner_user_id: profile.id,
      created_by: profile.id,
      is_active: true,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(dashboardPath);
    redirectWithMessage("success", "Default compliance template added.");
  } catch (error) {
    const message = toErrorMessage(error, "Failed to create template.");
    redirectWithMessage("error", message);
  }
}

export async function createTaskFromTemplateAction(formData: FormData) {
  try {
    const { supabase, profile } = await ensureAuthenticatedUser();
    const templateId = readRequired(formData.get("template_id"), "Template");
    const dueAtInput = formData.get("due_at")?.toString();

    const { data: template, error: templateError } = await supabase
      .from("compliance_templates")
      .select("id, title, description, recurrence, scope, section_id, owner_user_id")
      .eq("id", templateId)
      .single();

    if (templateError || !template) {
      throw new Error("Template not found.");
    }

    const dueAt =
      dueAtInput && dueAtInput.length > 0
        ? new Date(dueAtInput).toISOString()
        : computeDueDateFromRecurrence(template.recurrence as Recurrence);

    const assignToSection = template.scope === "section" && profile.role === "admin";

    const { error } = await supabase.from("tasks").insert({
      title: template.title,
      description: template.description,
      created_by: profile.id,
      assignee_scope: assignToSection ? "section" : "user",
      assignee_section_id: assignToSection ? template.section_id : null,
      assignee_user_id: assignToSection ? null : profile.id,
      recurrence: template.recurrence,
      due_at: dueAt,
      source_template_id: template.id,
      notify_admin: false,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(dashboardPath);
    redirectWithMessage("success", "Task created from default template.");
  } catch (error) {
    const message = toErrorMessage(error, "Failed to create task from template.");
    redirectWithMessage("error", message);
  }
}

export async function addProgressUpdateAction(formData: FormData) {
  try {
    const { supabase, profile } = await ensureAuthenticatedUser();
    const taskId = readRequired(formData.get("task_id"), "Task");
    const progressPercent = Number(readRequired(formData.get("progress"), "Progress"));
    const status = parseTaskStatus(readRequired(formData.get("status"), "Status"));
    const notes = formData.get("notes")?.toString().trim() || null;
    const evidenceFiles = formData
      .getAll("evidence")
      .filter((entry): entry is File => entry instanceof File && entry.size > 0);

    if (Number.isNaN(progressPercent) || progressPercent < 0 || progressPercent > 100) {
      throw new Error("Progress must be between 0 and 100.");
    }

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      throw new Error("Task not found or access denied.");
    }

    const { data: progressUpdate, error: progressError } = await supabase
      .from("task_progress_updates")
      .insert({
        task_id: taskId,
        user_id: profile.id,
        progress_percent: progressPercent,
        status,
        notes,
      })
      .select("id")
      .single();

    if (progressError || !progressUpdate) {
      throw new Error(progressError?.message ?? "Failed to save progress update.");
    }

    for (const file of evidenceFiles) {
      if (file.size > 50 * 1024 * 1024) {
        throw new Error(`File "${file.name}" exceeds the 50MB upload limit.`);
      }

      const safeName = sanitizeFileName(file.name);
      const filePath = `${profile.id}/${taskId}/${Date.now()}-${safeName}`;
      const fileBuffer = await file.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("proof-files")
        .upload(filePath, fileBuffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      const { error: attachmentError } = await supabase.from("task_attachments").insert({
        task_id: taskId,
        progress_update_id: progressUpdate.id,
        uploaded_by: profile.id,
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type || null,
        file_size: file.size,
      });

      if (attachmentError) {
        throw new Error(attachmentError.message);
      }
    }

    const updateTaskPayload: { status: TaskStatus; completed_at?: string | null } = {
      status,
    };
    if (status === "completed") {
      updateTaskPayload.completed_at = new Date().toISOString();
    } else if (status === "in_progress" || status === "pending") {
      updateTaskPayload.completed_at = null;
    }

    const { error: updateTaskError } = await supabase
      .from("tasks")
      .update(updateTaskPayload)
      .eq("id", taskId);

    if (updateTaskError) {
      throw new Error(updateTaskError.message);
    }

    revalidatePath(dashboardPath);
    redirectWithMessage("success", "Progress update submitted.");
  } catch (error) {
    const message = toErrorMessage(error, "Failed to update progress.");
    redirectWithMessage("error", message);
  }
}

export async function submitTaskForReviewAction(formData: FormData) {
  try {
    const { supabase, profile } = await ensureAuthenticatedUser();
    const taskId = readRequired(formData.get("task_id"), "Task");
    const notes = formData.get("notes")?.toString().trim() || null;

    if (!profile.section_id) {
      throw new Error("Your account has no section assignment.");
    }

    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("id")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      throw new Error("Task not found or access denied.");
    }

    const { error: submissionError } = await supabase.from("submissions").insert({
      task_id: taskId,
      submitted_by: profile.id,
      section_id: profile.section_id,
      notes,
      status: "pending",
    });

    if (submissionError) {
      throw new Error(submissionError.message);
    }

    const { error: taskUpdateError } = await supabase
      .from("tasks")
      .update({ status: "submitted" })
      .eq("id", taskId);

    if (taskUpdateError) {
      throw new Error(taskUpdateError.message);
    }

    revalidatePath(dashboardPath);
    redirectWithMessage("success", "Task submitted for admin review.");
  } catch (error) {
    const message = toErrorMessage(error, "Failed to submit for review.");
    redirectWithMessage("error", message);
  }
}

export async function markNotificationReadAction(formData: FormData) {
  try {
    const { supabase } = await ensureAuthenticatedUser();
    const notificationId = readRequired(formData.get("notification_id"), "Notification");

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath(dashboardPath);
    redirect(dashboardPath);
  } catch (error) {
    const message = toErrorMessage(error, "Failed to update notification status.");
    redirectWithMessage("error", message);
  }
}
