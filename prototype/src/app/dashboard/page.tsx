import { redirect } from "next/navigation";

import { signOutAction } from "@/app/actions/auth-actions";
import {
  addProgressUpdateAction,
  assignSectionDefaultsAction,
  assignTaskToSectionAction,
  createManagedUserAction,
  createSelfTaskAction,
  createTaskFromTemplateAction,
  createUserTemplateAction,
  deactivateUserAction,
  markNotificationReadAction,
  reviewSubmissionAction,
  submitTaskForReviewAction,
  updateUserAssignmentAction,
} from "@/app/actions/dashboard-actions";
import {
  RECURRENCE_OPTIONS,
  RECURRING_OPTIONS,
  SECTION_OPTIONS,
  TASK_STATUS_OPTIONS,
  USER_ROLE_OPTIONS,
} from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  ComplianceTemplate,
  Notification,
  Profile,
  ProgressUpdate,
  Section,
  Submission,
  Task,
  TaskAttachment,
} from "@/lib/types";
import { formatDateTime, sectionNameFromId, toLocalDatetimeValue } from "@/lib/utils";

type SearchParams = Record<string, string | string[] | undefined>;

type SubmissionWithDetails = Submission & {
  task: { title: string } | null;
  submitter: { full_name: string; section_id: number | null } | null;
  section: { name: string } | null;
};

type ProfileWithSection = Profile & {
  section: { name: string } | null;
};

type AttachmentWithSignedUrl = TaskAttachment & {
  signed_url: string | null;
};

const statusColors: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  in_progress: "bg-sky-100 text-sky-700",
  submitted: "bg-indigo-100 text-indigo-700",
  approved: "bg-emerald-100 text-emerald-700",
  disapproved: "bg-rose-100 text-rose-700",
  completed: "bg-emerald-100 text-emerald-700",
  overdue: "bg-rose-100 text-rose-700",
};

const Badge = ({ value }: { value: string }) => (
  <span
    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
      statusColors[value] ?? "bg-slate-100 text-slate-700"
    }`}
  >
    {value.replace("_", " ")}
  </span>
);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const resolvedParams = await Promise.resolve(searchParams ?? {});
  const errorMessage = Array.isArray(resolvedParams.error)
    ? resolvedParams.error[0]
    : resolvedParams.error;
  const successMessage = Array.isArray(resolvedParams.success)
    ? resolvedParams.success[0]
    : resolvedParams.success;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, section_id, is_active")
    .eq("id", user.id)
    .single();

  if (profileError || !profileData) {
    redirect("/login?error=Profile not found.");
  }

  const profile = profileData as Profile;

  if (!profile.is_active) {
    await supabase.auth.signOut();
    redirect("/login?error=Your account is inactive.");
  }

  await supabase.rpc("create_deadline_notifications", { p_hours_ahead: 24 });

  const [
    sectionsResult,
    notificationsResult,
    tasksResult,
    progressResult,
    attachmentsResult,
    templatesResult,
    usersResult,
    submissionsResult,
  ] = await Promise.all([
    supabase.from("sections").select("id, name").order("id", { ascending: true }),
    supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("tasks")
      .select("*")
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("task_progress_updates")
      .select("id, task_id, user_id, progress_percent, status, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("task_attachments")
      .select(
        "id, task_id, progress_update_id, uploaded_by, file_name, file_path, mime_type, file_size, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("compliance_templates")
      .select(
        "id, title, description, recurrence, scope, section_id, owner_user_id, is_active, created_at",
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(100),
    profile.role === "admin"
      ? supabase
          .from("profiles")
          .select(
            "id, full_name, role, section_id, is_active, section:sections!profiles_section_id_fkey(name)",
          )
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
    profile.role === "admin"
      ? supabase
          .from("submissions")
          .select(
            "id, task_id, submitted_by, section_id, notes, status, reviewed_by, feedback, reviewed_at, created_at, task:tasks!submissions_task_id_fkey(title), submitter:profiles!submissions_submitted_by_fkey(full_name, section_id), section:sections!submissions_section_id_fkey(name)",
          )
          .order("created_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const sections = (sectionsResult.data ?? []) as Section[];
  const notifications = (notificationsResult.data ?? []) as Notification[];
  const tasks = (tasksResult.data ?? []) as Task[];
  const progressUpdates = (progressResult.data ?? []) as ProgressUpdate[];
  const attachments = (attachmentsResult.data ?? []) as TaskAttachment[];
  const templates = (templatesResult.data ?? []) as ComplianceTemplate[];
  const users = (usersResult.data ?? []) as ProfileWithSection[];
  const submissions = (submissionsResult.data ?? []) as SubmissionWithDetails[];

  const attachmentUrls: AttachmentWithSignedUrl[] = await Promise.all(
    attachments.map(async (attachment) => {
      const { data } = await supabase.storage
        .from("proof-files")
        .createSignedUrl(attachment.file_path, 60 * 60);
      return {
        ...attachment,
        signed_url: data?.signedUrl ?? null,
      };
    }),
  );

  const updatesByTask = progressUpdates.reduce<Record<string, ProgressUpdate[]>>(
    (map, update) => {
      map[update.task_id] ??= [];
      map[update.task_id].push(update);
      return map;
    },
    {},
  );

  const attachmentsByTask = attachmentUrls.reduce<Record<string, AttachmentWithSignedUrl[]>>(
    (map, attachment) => {
      map[attachment.task_id] ??= [];
      map[attachment.task_id].push(attachment);
      return map;
    },
    {},
  );

  const pendingSubmissions = submissions.filter((submission) => submission.status === "pending");
  const reviewedSubmissions = submissions.filter((submission) => submission.status !== "pending");
  const availableSections: Array<{ id: number; name: string }> =
    sections.length > 0 ? sections : [...SECTION_OPTIONS];

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Compliance Monitoring System
              </h1>
              <p className="text-sm text-slate-600">
                Logged in as <strong>{profile.full_name}</strong> (
                {profile.role.toUpperCase()}) - {sectionNameFromId(profile.section_id)}
              </p>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                Sign out
              </button>
            </form>
          </div>
          {errorMessage ? (
            <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </p>
          ) : null}
          {successMessage ? (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {successMessage}
            </p>
          ) : null}
        </header>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Notifications</h2>
          <div className="mt-3 space-y-3">
            {notifications.length === 0 ? (
              <p className="text-sm text-slate-500">No notifications yet.</p>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-lg border px-4 py-3 ${
                    notification.is_read
                      ? "border-slate-200 bg-slate-50"
                      : "border-indigo-200 bg-indigo-50"
                  }`}
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{notification.title}</p>
                      <p className="text-sm text-slate-600">{notification.message}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatDateTime(notification.created_at)}
                      </p>
                    </div>
                    {!notification.is_read ? (
                      <form action={markNotificationReadAction}>
                        <input type="hidden" name="notification_id" value={notification.id} />
                        <button
                          type="submit"
                          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                        >
                          Mark as read
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {profile.role === "admin" ? (
          <>
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">Add Admin/User</h2>
                <form action={createManagedUserAction} className="mt-4 space-y-3">
                  <input
                    name="full_name"
                    required
                    placeholder="Full name"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="email"
                    name="email"
                    required
                    placeholder="Email"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <input
                    name="temporary_password"
                    required
                    minLength={8}
                    placeholder="Temporary password"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      name="role"
                      defaultValue="user"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {USER_ROLE_OPTIONS.map((roleOption) => (
                        <option key={roleOption.value} value={roleOption.value}>
                          {roleOption.label}
                        </option>
                      ))}
                    </select>
                    <select
                      name="section_id"
                      required
                      defaultValue={2}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {availableSections.map((section) => (
                        <option key={section.id} value={section.id}>
                          Section {section.id} - {section.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Create account
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  Assign tasks & section defaults
                </h2>
                <form action={assignTaskToSectionAction} className="mt-4 space-y-3">
                  <input
                    name="title"
                    required
                    placeholder="Compliance title"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="Description or instructions"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <select
                      name="section_id"
                      required
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {availableSections.map((section) => (
                        <option key={section.id} value={section.id}>
                          Section {section.id} - {section.name}
                        </option>
                      ))}
                    </select>
                    <select
                      name="recurrence"
                      defaultValue="none"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {RECURRENCE_OPTIONS.map((recurrenceOption) => (
                        <option
                          key={recurrenceOption.value}
                          value={recurrenceOption.value}
                        >
                          {recurrenceOption.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="datetime-local"
                      name="due_at"
                      defaultValue={toLocalDatetimeValue()}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    Assign to section
                  </button>
                </form>

                <form action={assignSectionDefaultsAction} className="mt-5 flex gap-2">
                  <select
                    name="section_id"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {availableSections.map((section) => (
                      <option key={section.id} value={section.id}>
                        Assign all defaults to {section.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                  >
                    Assign defaults
                  </button>
                </form>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">
                User management & section assignments
              </h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="py-2 pr-4">Name</th>
                      <th className="py-2 pr-4">Role</th>
                      <th className="py-2 pr-4">Section</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((managedUser) => (
                      <tr key={managedUser.id} className="border-b border-slate-100">
                        <td className="py-3 pr-4">{managedUser.full_name}</td>
                        <td className="py-3 pr-4">
                          <form action={updateUserAssignmentAction} className="flex gap-2">
                            <input type="hidden" name="user_id" value={managedUser.id} />
                            <select
                              name="role"
                              defaultValue={managedUser.role}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                            >
                              {USER_ROLE_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <select
                              name="section_id"
                              defaultValue={managedUser.section_id ?? 1}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                            >
                              {availableSections.map((section) => (
                                <option key={section.id} value={section.id}>
                                  {section.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="submit"
                              className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white hover:bg-slate-700"
                            >
                              Save
                            </button>
                          </form>
                        </td>
                        <td className="py-3 pr-4">{sectionNameFromId(managedUser.section_id)}</td>
                        <td className="py-3 pr-4">
                          {managedUser.is_active ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">
                              Active
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-semibold text-slate-700">
                              Inactive
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4">
                          <form action={deactivateUserAction}>
                            <input type="hidden" name="user_id" value={managedUser.id} />
                            <button
                              type="submit"
                              disabled={!managedUser.is_active || managedUser.id === profile.id}
                              className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Remove user
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Submissions for review</h2>
              <div className="mt-4 space-y-4">
                {pendingSubmissions.length === 0 ? (
                  <p className="text-sm text-slate-500">No pending submissions.</p>
                ) : (
                  pendingSubmissions.map((submission) => (
                    <div
                      key={submission.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {submission.task?.title ?? "Untitled task"}
                          </p>
                          <p className="text-sm text-slate-600">
                            Submitted by: {submission.submitter?.full_name ?? "Unknown"} (
                            {submission.section?.name ?? "No section"})
                          </p>
                          <p className="text-sm text-slate-600">
                            Notes: {submission.notes || "No notes provided"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(submission.created_at)}
                          </p>
                        </div>
                        <Badge value={submission.status} />
                      </div>
                      <form action={reviewSubmissionAction} className="mt-3 space-y-2">
                        <input type="hidden" name="submission_id" value={submission.id} />
                        <select
                          name="decision"
                          defaultValue="approved"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm md:w-auto"
                        >
                          <option value="approved">Approve</option>
                          <option value="disapproved">Disapprove</option>
                        </select>
                        <textarea
                          name="feedback"
                          rows={2}
                          placeholder="Feedback for the user/section"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                        >
                          Save review
                        </button>
                      </form>
                    </div>
                  ))
                )}
              </div>

              {reviewedSubmissions.length > 0 ? (
                <details className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                    Recent reviewed submissions ({reviewedSubmissions.length})
                  </summary>
                  <ul className="mt-3 space-y-2 text-sm text-slate-600">
                    {reviewedSubmissions.slice(0, 20).map((submission) => (
                      <li key={submission.id} className="rounded-md bg-slate-50 p-3">
                        <span className="font-semibold text-slate-800">
                          {submission.task?.title ?? "Untitled task"}
                        </span>{" "}
                        - {submission.submitter?.full_name ?? "Unknown"} -{" "}
                        {submission.status}
                        {submission.feedback ? ` - "${submission.feedback}"` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          </>
        ) : (
          <>
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  Create your compliance task
                </h2>
                <form action={createSelfTaskAction} className="mt-4 space-y-3">
                  <input
                    name="title"
                    required
                    placeholder="Task title"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="Task details"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <select
                      name="recurrence"
                      defaultValue="none"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {RECURRENCE_OPTIONS.map((recurrenceOption) => (
                        <option key={recurrenceOption.value} value={recurrenceOption.value}>
                          {recurrenceOption.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="datetime-local"
                      name="due_at"
                      defaultValue={toLocalDatetimeValue()}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" name="notify_admin" className="h-4 w-4" />
                    Notify admin for visibility
                  </label>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
                  >
                    Create task
                  </button>
                </form>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  Your default daily/weekly/monthly compliances
                </h2>
                <form action={createUserTemplateAction} className="mt-4 space-y-3">
                  <input
                    name="title"
                    required
                    placeholder="Default compliance title"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <textarea
                    name="description"
                    rows={2}
                    placeholder="Default compliance notes"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <select
                      name="recurrence"
                      required
                      defaultValue="daily"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    >
                      {RECURRING_OPTIONS.map((recurrenceOption) => (
                        <option key={recurrenceOption.value} value={recurrenceOption.value}>
                          {recurrenceOption.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                    >
                      Add default
                    </button>
                  </div>
                </form>

                <div className="mt-4 space-y-3">
                  {templates.length === 0 ? (
                    <p className="text-sm text-slate-500">No templates available.</p>
                  ) : (
                    templates.map((template) => (
                      <form
                        key={template.id}
                        action={createTaskFromTemplateAction}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                      >
                        <input type="hidden" name="template_id" value={template.id} />
                        <p className="font-medium text-slate-900">{template.title}</p>
                        <p className="text-xs text-slate-600">
                          {template.scope === "section"
                            ? `Section default (${sectionNameFromId(template.section_id)})`
                            : "Your personal default"}{" "}
                          - {template.recurrence}
                        </p>
                        <div className="mt-2 flex flex-col gap-2 md:flex-row">
                          <input
                            type="datetime-local"
                            name="due_at"
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                          />
                          <button
                            type="submit"
                            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                          >
                            Create task from template
                          </button>
                        </div>
                      </form>
                    ))
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            {profile.role === "admin" ? "All tracked compliances" : "Your section compliances"}
          </h2>
          <div className="mt-4 space-y-4">
            {tasks.length === 0 ? (
              <p className="text-sm text-slate-500">No compliance tasks yet.</p>
            ) : (
              tasks.map((task) => (
                <details
                  key={task.id}
                  className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{task.title}</p>
                        <p className="text-sm text-slate-600">
                          Section: {sectionNameFromId(task.assignee_section_id)} | Due:{" "}
                          {formatDateTime(task.due_at)} | Recurrence: {task.recurrence}
                        </p>
                      </div>
                      <Badge value={task.status} />
                    </div>
                  </summary>

                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                      <p className="text-sm text-slate-700">
                        {task.description || "No description provided."}
                      </p>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">
                          Progress timeline
                        </p>
                        <div className="mt-2 space-y-2">
                          {(updatesByTask[task.id] ?? []).slice(0, 5).map((update) => (
                            <div key={update.id} className="rounded-md bg-slate-50 p-2 text-xs">
                              <div className="flex items-center justify-between">
                                <span>{update.progress_percent}% complete</span>
                                <Badge value={update.status} />
                              </div>
                              <p className="mt-1 text-slate-600">{update.notes || "No notes."}</p>
                              <p className="mt-1 text-slate-500">
                                {formatDateTime(update.created_at)}
                              </p>
                            </div>
                          ))}
                          {(updatesByTask[task.id] ?? []).length === 0 ? (
                            <p className="text-xs text-slate-500">
                              No progress updates yet.
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-900">Proof attachments</p>
                        <ul className="mt-2 space-y-1 text-xs">
                          {(attachmentsByTask[task.id] ?? []).slice(0, 8).map((attachment) => (
                            <li key={attachment.id}>
                              {attachment.signed_url ? (
                                <a
                                  href={attachment.signed_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-indigo-700 hover:underline"
                                >
                                  {attachment.file_name}
                                </a>
                              ) : (
                                <span>{attachment.file_name}</span>
                              )}
                            </li>
                          ))}
                          {(attachmentsByTask[task.id] ?? []).length === 0 ? (
                            <li className="text-slate-500">No files uploaded yet.</li>
                          ) : null}
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <form
                        action={addProgressUpdateAction}
                        className="rounded-lg border border-slate-200 bg-white p-3"
                      >
                        <input type="hidden" name="task_id" value={task.id} />
                        <p className="text-sm font-semibold text-slate-900">
                          Update progress
                        </p>
                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            name="progress"
                            required
                            defaultValue={0}
                            placeholder="Progress %"
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                          />
                          <select
                            name="status"
                            defaultValue="in_progress"
                            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                          >
                            {TASK_STATUS_OPTIONS.map((statusOption) => (
                              <option key={statusOption.value} value={statusOption.value}>
                                {statusOption.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <textarea
                          name="notes"
                          rows={2}
                          placeholder="Progress notes"
                          className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                        <input
                          type="file"
                          name="evidence"
                          multiple
                          className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                        <button
                          type="submit"
                          className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                        >
                          Save progress
                        </button>
                      </form>

                      <form
                        action={submitTaskForReviewAction}
                        className="rounded-lg border border-slate-200 bg-white p-3"
                      >
                        <input type="hidden" name="task_id" value={task.id} />
                        <p className="text-sm font-semibold text-slate-900">
                          Submit complied assignment for review
                        </p>
                        <textarea
                          name="notes"
                          rows={2}
                          placeholder="Submission notes"
                          className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                        <button
                          type="submit"
                          className="mt-2 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                          Submit for admin review
                        </button>
                      </form>
                    </div>
                  </div>
                </details>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
