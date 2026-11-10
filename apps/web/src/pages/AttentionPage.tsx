import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import {
  apiFetch,
  type AttentionResponse,
  type Overview,
} from "../api";
import {
  attentionKindLabel,
  healthStatusLabel,
  severityLabel,
} from "../labels";

export function AttentionPage() {
  const { apiKey } = useAuth();
  const qc = useQueryClient();
  const attention = useQuery({
    queryKey: ["attention"],
    queryFn: () => apiFetch<AttentionResponse>("/api/attention", apiKey!),
    enabled: !!apiKey,
  });
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiFetch<Overview>("/api/overview", apiKey!),
    enabled: !!apiKey,
  });

  const ack = useMutation({
    mutationFn: (taskId: string) =>
      apiFetch(`/api/tasks/${taskId}/acknowledge`, apiKey!, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["attention"] });
    },
  });

  const items = attention.data?.items ?? [];
  const quietHours = attention.data?.staleHours;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Needs you</h1>
          <p>
            {overview.data?.workspace.name ?? "Your workspace"} · quietly
            flags work with no update for {quietHours ?? "…"} hours
          </p>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Needs a nudge</h2>
        {attention.isLoading && <div className="empty">Loading…</div>}
        {!attention.isLoading && items.length === 0 && (
          <div className="empty">
            All clear. Nothing stuck, quiet, or behind right now.
          </div>
        )}
        {items.map((item) => (
          <div className="attention-item" key={`${item.kind}-${item.id}`}>
            <span className={`badge ${item.severity}`}>
              {severityLabel(item.severity)}
            </span>
            <div>
              <div>
                {item.kind === "behind_kr" ? (
                  <span>{item.title}</span>
                ) : (
                  <Link to="/tasks">{item.title ?? item.id}</Link>
                )}
              </div>
              <div className="meta">
                {attentionKindLabel(item.kind)} · {item.reason}
              </div>
            </div>
            {item.kind === "stale_task" && (
              <button
                className="btn"
                type="button"
                onClick={() => ack.mutate(item.id)}
                disabled={ack.isPending}
              >
                Got it
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="page-header" style={{ marginTop: "1.75rem" }}>
        <div>
          <h1 style={{ fontSize: 16 }}>At a glance</h1>
          <p>Goals for this period</p>
        </div>
      </div>
      <div className="obj-grid">
        {(overview.data?.objectives ?? []).map((obj) => (
          <Link className="obj-card" key={obj.id} to={`/objectives/${obj.id}`}>
            <h3>{obj.title}</h3>
            <div className="progress" style={{ marginBottom: "0.6rem" }}>
              <span style={{ width: `${obj.completionPercent}%` }} />
            </div>
            <div className="meta row" style={{ justifyContent: "space-between" }}>
              <span className={`status-${obj.suggestedStatus}`}>
                {obj.completionPercent.toFixed(0)}% ·{" "}
                {healthStatusLabel(obj.suggestedStatus)}
              </span>
              <span>
                {obj.keyResultCount}{" "}
                {obj.keyResultCount === 1 ? "target" : "targets"} ·{" "}
                {obj.taskCount} {obj.taskCount === 1 ? "task" : "tasks"}
                {obj.atRiskKeyResults > 0
                  ? ` · ${obj.atRiskKeyResults} at risk`
                  : ""}
              </span>
            </div>
          </Link>
        ))}
        {!overview.isLoading && (overview.data?.objectives.length ?? 0) === 0 && (
          <div className="empty">
            No goals yet. Ask a helper to add one for this period.
          </div>
        )}
      </div>
    </div>
  );
}
