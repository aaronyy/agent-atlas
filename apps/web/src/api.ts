export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error ?? res.statusText,
      res.status,
    );
  }
  return res.json() as Promise<T>;
}

export interface Overview {
  workspace: { id: string; name: string };
  cycle: {
    id: string;
    name: string;
    startsAt: string;
    endsAt: string;
  } | null;
  objectives: Array<{
    id: string;
    title: string;
    status: string;
    completionPercent: number;
    suggestedStatus: string;
    keyResultCount: number;
    taskCount: number;
    atRiskKeyResults: number;
  }>;
  staleHours: number;
}

export interface AttentionResponse {
  items: Array<{
    kind: string;
    id: string;
    title?: string;
    reason: string;
    severity: "high" | "medium" | "low";
  }>;
  staleHours: number;
}

export interface ObjectiveDetail {
  objective: {
    id: string;
    title: string;
    description: string | null;
    status: string;
  };
  keyResults: Array<{
    id: string;
    title: string;
    status: string;
    kind: string;
    unit: string;
    targetValue: string;
    currentValue: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    keyResultId: string | null;
    priority: number;
  }>;
  projects: Array<{ id: string; title: string; status: string }>;
  events: Array<{
    id: string;
    eventType: string;
    note: string | null;
    createdAt: string;
  }>;
  rollup: {
    completionPercent: number;
    suggestedStatus: string;
  };
  keyResultRollups: Array<{
    keyResultId: string;
    completionPercent: number;
  }>;
}

export interface AgentSummary {
  id: string;
  slug: string;
  name: string;
  modelHint: string | null;
  openTasks: number;
  doneTasks: number;
  inProgress: number;
}

export interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: number;
  assigneeAgentId: string | null;
  objectiveId: string | null;
  updatedAt: string;
}

export interface ConnectInfo {
  mcpUrl: string;
  healthUrl: string;
  auth: string;
  tip: string;
}
