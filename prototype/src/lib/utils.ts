import { SECTION_OPTIONS } from "@/lib/constants";
import type { Recurrence } from "@/lib/types";

export const sectionNameFromId = (sectionId: number | null | undefined) => {
  if (!sectionId) {
    return "Unassigned";
  }

  return (
    SECTION_OPTIONS.find((section) => section.id === sectionId)?.name ??
    `Section ${sectionId}`
  );
};

export const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "No deadline";
  }

  const date = new Date(value);
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

export const sanitizeFileName = (fileName: string) =>
  fileName.replace(/[^a-zA-Z0-9._-]/g, "_");

export const computeDueDateFromRecurrence = (
  recurrence: Recurrence,
  referenceDate = new Date(),
) => {
  const dueDate = new Date(referenceDate);

  if (recurrence === "daily") {
    dueDate.setDate(dueDate.getDate() + 1);
  } else if (recurrence === "weekly") {
    dueDate.setDate(dueDate.getDate() + 7);
  } else if (recurrence === "monthly") {
    dueDate.setMonth(dueDate.getMonth() + 1);
  }

  dueDate.setHours(17, 0, 0, 0);
  return dueDate.toISOString();
};

export const toLocalDatetimeValue = (value: Date = new Date()) => {
  const localDate = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};
