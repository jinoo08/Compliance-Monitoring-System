export type UserRole = "admin" | "user";
export type Recurrence = "none" | "daily" | "weekly" | "monthly";
export type TaskStatus =
  | "pending"
  | "in_progress"
  | "submitted"
  | "approved"
  | "disapproved"
  | "completed"
  | "overdue";

export type SubmissionStatus = "pending" | "approved" | "disapproved";

export type Section = {
  id: number;
  name: string;
};

export type Profile = {
  id: string;
  full_name: string;
  role: UserRole;
  section_id: number | null;
  is_active: boolean;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  created_by: string;
  assignee_scope: "section" | "user";
  assignee_section_id: number | null;
  assignee_user_id: string | null;
  recurrence: Recurrence;
  due_at: string | null;
  status: TaskStatus;
  notify_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type ComplianceTemplate = {
  id: string;
  title: string;
  description: string | null;
  recurrence: Exclude<Recurrence, "none">;
  scope: "section" | "user";
  section_id: number | null;
  owner_user_id: string | null;
  is_active: boolean;
  created_at: string;
};

export type ProgressUpdate = {
  id: string;
  task_id: string;
  user_id: string;
  progress_percent: number;
  status: TaskStatus;
  notes: string | null;
  created_at: string;
};

export type TaskAttachment = {
  id: string;
  task_id: string;
  progress_update_id: string | null;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
};

export type Submission = {
  id: string;
  task_id: string;
  submitted_by: string;
  section_id: number;
  notes: string | null;
  status: SubmissionStatus;
  reviewed_by: string | null;
  feedback: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  recipient_user_id: string | null;
  recipient_section_id: number | null;
  type: "task_assigned" | "submission_reviewed" | "deadline_near" | "general";
  title: string;
  message: string;
  task_id: string | null;
  submission_id: string | null;
  is_read: boolean;
  created_at: string;
};
