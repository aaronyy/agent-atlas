import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth";
import { apiFetch, type ObjectiveDetail } from "../api";
import { healthStatusLabel, humanize, taskStatusLabel } from "../labels";

export function ObjectivePage() {
  const { id } = useParams();
  const { apiKey } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");

  const detail = useQuery({
    queryKey: ["objective", id],
    queryFn: () => apiFetch<ObjectiveDetail>(`/api/objectives/${id}`, apiKey!),
    enabled: !!apiKey && !!id,
  });

  const addComment = useMutation({
    mutationFn: () =>
      apiFetch("/api/comments", apiKey!, {
        method: "POST",
        body: JSON.stringify({
          entityKind: "objective",
          entityId: id,
          body: comment,
          authorLabel: "human",
        }),
      }),
    onSuccess: () => {
      setComment("");
      void qc.invalidateQueries({ queryKey: ["objective", id] });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    addComment.mutate();
  }

  if (detail.isLoading) return <div className="empty">Loading…</div>;
  if (detail.isError || !detail.data)
    return <div className="error">Goal not found</div>;

  const data = detail.data;
  const rollupById = new Map(
    data.keyResultRollups.map((r) => [r.keyResultId, r.completionPercent]),
  );

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <div className="meta" style={{ marginBottom: "0.35rem" }}>
            <Link to="/cycle">This period</Link> / goal
          </div>
          <h1>{data.objective.title}</h1>
          <p>
            <span className={`status-${data.rollup.suggestedStatus}`}>
              {data.rollup.completionPercent.toFixed(0)}% ·{" "}
              {healthStatusLabel(data.rollup.suggestedStatus)}
            </span>
            {data.objective.description
              ? ` · ${data.objective.description}`
              : ""}
          </p>
        </div>
      </div>

      <div className="progress" style={{ height: 8 }}>
        <span style={{ width: `${data.rollup.completionPercent}%` }} />
      </div>

      <div className="panel">
        <h2 className="panel-title">Targets</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Progress</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.keyResults.map((kr) => {
              const pct = rollupById.get(kr.id) ?? 0;
              return (
                <tr key={kr.id}>
                  <td>{kr.title}</td>
                  <td>
                    <span className="chip">{humanize(kr.kind)}</span>
                  </td>
                  <td style={{ minWidth: 140 }}>
                    <div className="progress" style={{ marginBottom: 4 }}>
                      <span style={{ width: `${pct}%` }} />
                    </div>
                    <span className="meta">
                      {Number(kr.currentValue)} / {Number(kr.targetValue)}{" "}
                      {kr.unit}
                    </span>
                  </td>
                  <td className={`status-${kr.status}`}>
                    {healthStatusLabel(kr.status)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {data.keyResults.length === 0 && (
          <div className="empty">No targets yet.</div>
        )}
      </div>

      <div className="panel">
        <h2 className="panel-title">Work</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {data.tasks.map((t) => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td>
                  <span className="chip">{taskStatusLabel(t.status)}</span>
                </td>
                <td>{t.priority}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.tasks.length === 0 && <div className="empty">No linked work yet.</div>}
      </div>

      <div className="panel">
        <h2 className="panel-title">Activity</h2>
        <div className="stack">
          {data.events.map((ev) => (
            <div key={ev.id}>
              <div className="mono meta">
                {new Date(ev.createdAt).toLocaleString()} ·{" "}
                {humanize(ev.eventType)}
              </div>
              <div>{ev.note}</div>
            </div>
          ))}
          {data.events.length === 0 && (
            <div className="empty">No activity yet.</div>
          )}
        </div>
      </div>

      <form className="panel" onSubmit={onSubmit}>
        <h2 className="panel-title">Add a note</h2>
        <textarea
          className="textarea"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Leave a note for your helpers…"
        />
        <div style={{ marginTop: "0.75rem" }}>
          <button className="btn primary" type="submit" disabled={addComment.isPending}>
            Post note
          </button>
        </div>
      </form>
    </div>
  );
}
