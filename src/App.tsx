import { lazy, Suspense, useState } from "react";
import { Dashboard } from "./components/Dashboard";

type View = "dashboard" | "admin";

const AdminPanel = lazy(() =>
  import("./components/AdminPanel").then((module) => ({ default: module.AdminPanel })),
);

export function App() {
  const [view, setView] = useState<View>("dashboard");

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg className="wheat-logo" viewBox="0 0 48 48" aria-hidden="true">
            <g transform="rotate(24 24 24)">
              <path className="grain-body" d="M24 7C30.6 7 35.4 15.4 35.4 25 35.4 35.2 30.4 42.6 24 42.6S12.6 35.2 12.6 25C12.6 15.4 17.4 7 24 7Z" />
              <path className="grain-lit" d="M24 7C30.6 7 35.4 15.4 35.4 25 35.4 35.2 30.4 42.6 24 42.6 27.6 36.4 28.4 29.8 28.4 25 28.4 18.6 27 12.2 24 7Z" />
              <path className="grain-crease" d="M24 7C27 12.2 28.4 18.6 28.4 25 28.4 29.8 27.6 36.4 24 42.6" />
            </g>
          </svg>
          <h1>Wheat Temperature</h1>
        </div>
      </header>
      <main>
        {view === "dashboard" ? (
          <Dashboard />
        ) : (
          <Suspense fallback={<p className="muted-block">Loading admin…</p>}>
            <AdminPanel onBack={() => setView("dashboard")} />
          </Suspense>
        )}
      </main>
      {view === "dashboard" ? (
        <button type="button" className="view-switch" onClick={() => setView("admin")}>
          Admin
        </button>
      ) : null}
    </div>
  );
}
