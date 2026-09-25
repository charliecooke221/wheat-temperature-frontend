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
            <path
              d="M24 4C13.6 9.4 8 18.1 8 27.2 8 37 14.5 44 24 44s16-7 16-16.8C40 18.1 34.4 9.4 24 4Z"
              fill="currentColor"
            />
            <path d="M24 8v32M24 16c-4.7 0-8.2 2.1-10.7 5.2M24 24c4.8 0 8.5 2 11 5.1M24 32c-4.1 0-7.2 1.6-9.5 4" />
          </svg>
          <h1>Wheat Temperatures</h1>
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
