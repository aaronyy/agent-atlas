import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { apiFetch, type Overview } from "../api";
import { ThemePicker } from "../ThemePicker";

export function LoginPage() {
  const { setApiKey } = useAuth();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiFetch<Overview>("/api/overview", key.trim());
      setApiKey(key.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login-topbar">
        <ThemePicker />
      </div>
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Agent Atlas</h1>
        <p>
          Enter your workspace key to see goals, work, and what needs a nudge.
        </p>
        <div className="field">
          <label htmlFor="apiKey">Workspace key</label>
          <input
            id="apiKey"
            className="input mono"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Your workspace key"
            autoComplete="off"
            required
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" type="submit" disabled={loading}>
          {loading ? "Checking…" : "Open Agent Atlas"}
        </button>
      </form>
    </div>
  );
}
