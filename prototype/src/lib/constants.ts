export const SECTION_OPTIONS = [
  { id: 1, name: "Admin" },
  { id: 2, name: "Intelligence" },
  { id: 3, name: "Operation" },
  { id: 4, name: "Logistics" },
  { id: 5, name: "PRC" },
  { id: 6, name: "Finance" },
  { id: 7, name: "Investigation" },
  { id: 10, name: "IT" },
] as const;

export const USER_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
] as const;

export const RECURRENCE_OPTIONS = [
  { value: "none", label: "One-time" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

export const RECURRING_OPTIONS = RECURRENCE_OPTIONS.filter(
  (option) => option.value !== "none",
);

export const TASK_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "submitted", label: "Submitted" },
  { value: "completed", label: "Completed" },
] as const;
