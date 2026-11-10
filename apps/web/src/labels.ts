/** Plain-language labels for statuses and attention kinds. */

const TASK_STATUS: Record<string, string> = {
  backlog: "Waiting",
  ready: "Ready",
  in_progress: "In progress",
  blocked: "Stuck",
  done: "Done",
  cancelled: "Cancelled",
};

const HEALTH_STATUS: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  behind: "Behind",
  done: "Done",
};

const ATTENTION_KIND: Record<string, string> = {
  stale_task: "Quiet too long",
  blocked_task: "Stuck",
  behind_kr: "Falling behind",
};

const SEVERITY: Record<string, string> = {
  high: "Urgent",
  medium: "Soon",
  low: "Later",
};

export function taskStatusLabel(status: string): string {
  return TASK_STATUS[status] ?? humanize(status);
}

export function healthStatusLabel(status: string): string {
  return HEALTH_STATUS[status] ?? humanize(status);
}

export function attentionKindLabel(kind: string): string {
  return ATTENTION_KIND[kind] ?? humanize(kind);
}

export function severityLabel(severity: string): string {
  return SEVERITY[severity] ?? humanize(severity);
}

export function humanize(value: string): string {
  return value.replaceAll("_", " ");
}
