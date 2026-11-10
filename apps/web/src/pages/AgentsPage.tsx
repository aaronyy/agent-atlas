import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { apiFetch, type AgentSummary } from "../api";

export function AgentsPage() {
  const { apiKey } = useAuth();
  const agents = useQuery({
    queryKey: ["agents"],
    queryFn: () => apiFetch<AgentSummary[]>("/api/agents", apiKey!),
    enabled: !!apiKey,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Helpers</h1>
          <p>Who is working, and how much is still open</p>
        </div>
      </div>
      <div className="obj-grid">
        {(agents.data ?? []).map((a) => (
          <div className="obj-card" key={a.id}>
            <h3>{a.name}</h3>
            <div className="meta" style={{ marginBottom: "0.75rem" }}>
              {a.modelHint ? a.modelHint : a.slug}
            </div>
            <div className="row">
              <span className="chip">{a.inProgress} in progress</span>
              <span className="chip">{a.openTasks} open</span>
              <span className="chip">{a.doneTasks} done</span>
            </div>
          </div>
        ))}
        {!agents.isLoading && (agents.data?.length ?? 0) === 0 && (
          <div className="empty">
            No helpers linked yet. Open Set up to connect one.
          </div>
        )}
      </div>
    </div>
  );
}
