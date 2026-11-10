import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { ThemePicker } from "./ThemePicker";
import { AttentionPage } from "./pages/AttentionPage";
import { CyclePage } from "./pages/CyclePage";
import { ObjectivePage } from "./pages/ObjectivePage";
import { TasksPage } from "./pages/TasksPage";
import { AgentsPage } from "./pages/AgentsPage";
import { ConnectPage } from "./pages/ConnectPage";
import { LoginPage } from "./pages/LoginPage";

export function App() {
  const { apiKey, setApiKey } = useAuth();
  if (!apiKey) return <LoginPage />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-name">Agent Atlas</div>
          <div className="brand-sub">See what needs a nudge</div>
        </div>
        <nav className="nav">
          <NavLink to="/" end>
            Needs you
          </NavLink>
          <NavLink to="/cycle">This period</NavLink>
          <NavLink to="/tasks">Work</NavLink>
          <NavLink to="/agents">Helpers</NavLink>
          <NavLink to="/connect">Set up</NavLink>
        </nav>
        <div className="sidebar-footer">
          <button className="btn ghost" type="button" onClick={() => setApiKey(null)}>
            Sign out
          </button>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <div className="topbar-spacer" />
          <ThemePicker />
        </header>
        <main className="main">
          <Routes>
            <Route path="/" element={<AttentionPage />} />
            <Route path="/cycle" element={<CyclePage />} />
            <Route path="/objectives/:id" element={<ObjectivePage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/connect" element={<ConnectPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
