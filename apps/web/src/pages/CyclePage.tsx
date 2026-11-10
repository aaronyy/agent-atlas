import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../auth";
import { apiFetch, type Overview } from "../api";
import { healthStatusLabel } from "../labels";

export function CyclePage() {
  const { apiKey } = useAuth();
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: () => apiFetch<Overview>("/api/overview", apiKey!),
    enabled: !!apiKey,
  });

  const cycle = overview.data?.cycle;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>This period</h1>
          <p>
            {cycle
              ? `${cycle.name} · ${new Date(cycle.startsAt).toLocaleDateString()} → ${new Date(cycle.endsAt).toLocaleDateString()}`
              : "No active period yet. Ask a helper to start one."}
          </p>
        </div>
      </div>

      <div className="obj-grid">
        {(overview.data?.objectives ?? []).map((obj) => (
          <Link key={obj.id} className="obj-card" to={`/objectives/${obj.id}`}>
            <div className="meta" style={{ marginBottom: "0.4rem" }}>
              <span className={`status-${obj.status}`}>
                {healthStatusLabel(obj.status)}
              </span>
            </div>
            <h3>{obj.title}</h3>
            <div className="progress" style={{ margin: "0.75rem 0" }}>
              <span style={{ width: `${obj.completionPercent}%` }} />
            </div>
            <div className="meta">
              {obj.completionPercent.toFixed(0)}% complete · {obj.keyResultCount}{" "}
              {obj.keyResultCount === 1 ? "target" : "targets"} · {obj.taskCount}{" "}
              {obj.taskCount === 1 ? "task" : "tasks"}
            </div>
            {obj.atRiskKeyResults > 0 && (
              <div className="meta" style={{ marginTop: "0.4rem", color: "#ffc266" }}>
                {obj.atRiskKeyResults}{" "}
                {obj.atRiskKeyResults === 1 ? "target needs" : "targets need"}{" "}
                attention
              </div>
            )}
          </Link>
        ))}
        {!overview.isLoading && (overview.data?.objectives.length ?? 0) === 0 && (
          <div className="empty">
            No goals in this period yet. Ask a helper to add one.
          </div>
        )}
      </div>
    </div>
  );
}
