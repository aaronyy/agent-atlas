import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth";
import { apiFetch, type ConnectInfo } from "../api";

export function ConnectPage() {
  const { apiKey } = useAuth();
  const connect = useQuery({
    queryKey: ["connect"],
    queryFn: () => apiFetch<ConnectInfo>("/api/connect", apiKey!),
    enabled: !!apiKey,
  });

  const mcpUrl = connect.data?.mcpUrl ?? "http://localhost:8080/mcp";
  const localKey = apiKey ?? "atlas_local";

  const stdioSnippet = JSON.stringify(
    {
      mcpServers: {
        "agent-atlas": {
          command: "node",
          args: ["bin/atlas-mcp.mjs"],
          cwd: "/ABSOLUTE/PATH/TO/agent-atlas",
        },
      },
    },
    null,
    2,
  );

  const httpSnippet = JSON.stringify(
    {
      mcpServers: {
        "agent-atlas": {
          url: mcpUrl,
          headers: {
            Authorization: `Bearer ${localKey}`,
          },
        },
      },
    },
    null,
    2,
  );

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Set up</h1>
          <p>
            Link a helper so it can plan and update goals in Agent Atlas. Use the
            same key you signed in with.
          </p>
        </div>
      </div>

      <div className="stack">
        <div className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="panel-title" style={{ margin: 0 }}>
              On your computer (simplest)
            </h2>
            <button className="btn" type="button" onClick={() => void copy(stdioSnippet)}>
              Copy
            </button>
          </div>
          <p className="meta" style={{ margin: 0 }}>
            Paste this into your helper’s settings. Point the folder path at your
            Agent Atlas copy on disk.
          </p>
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: "0.85rem",
              background: "var(--bg)",
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              overflow: "auto",
            }}
          >
            {stdioSnippet}
          </pre>
        </div>

        <div className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 className="panel-title" style={{ margin: 0 }}>
              Over the internet
            </h2>
            <button className="btn" type="button" onClick={() => void copy(httpSnippet)}>
              Copy
            </button>
          </div>
          <div>
            <div className="panel-title">Address</div>
            <code>{mcpUrl}</code>
          </div>
          <div>
            <div className="panel-title">Key</div>
            <code>{localKey}</code>
          </div>
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: "0.85rem",
              background: "var(--bg)",
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              overflow: "auto",
            }}
          >
            {httpSnippet}
          </pre>
        </div>
      </div>
    </div>
  );
}
