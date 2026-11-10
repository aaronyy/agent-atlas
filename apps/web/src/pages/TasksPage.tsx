import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "../auth";
import { apiFetch, type TaskRow } from "../api";
import { taskStatusLabel } from "../labels";

const STATUSES = [
  "",
  "backlog",
  "ready",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;

export function TasksPage() {
  const { apiKey } = useAuth();
  const [status, setStatus] = useState<string>("");
  const [quietOnly, setQuietOnly] = useState(false);

  const tasks = useQuery({
    queryKey: ["tasks", status, quietOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (quietOnly) params.set("stale", "1");
      const q = params.toString();
      return apiFetch<TaskRow[]>(`/api/tasks${q ? `?${q}` : ""}`, apiKey!);
    },
    enabled: !!apiKey,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Work</h1>
          <p>Everything in progress across your workspace</p>
        </div>
        <div className="row">
          <select
            className="input"
            style={{ width: "auto" }}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s || "all"} value={s}>
                {s ? taskStatusLabel(s) : "All statuses"}
              </option>
            ))}
          </select>
          <label className="meta" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={quietOnly}
              onChange={(e) => setQuietOnly(e.target.checked)}
            />
            Quiet too long
          </label>
        </div>
      </div>

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {(tasks.data ?? []).map((t) => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td>
                  <span className="chip">{taskStatusLabel(t.status)}</span>
                </td>
                <td>{t.priority}</td>
                <td className="meta mono">
                  {new Date(t.updatedAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!tasks.isLoading && (tasks.data?.length ?? 0) === 0 && (
          <div className="empty">No work matches these filters.</div>
        )}
      </div>
    </div>
  );
}
