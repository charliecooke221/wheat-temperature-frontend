import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ApiError,
  getAdminConfig,
  login,
  saveAdminConfig,
  sendTestAlert,
} from "../api/client";
import type { AdminConfig, LayoutProbe } from "../api/types";
import { gridCells } from "../lib/probes";
import { clearSession, loadSession, saveSession, type AdminSession } from "../lib/session";
import { formatTimestamp } from "../lib/time";
import { ensureGrid, swapGrainPositions, validateConfig } from "../lib/validate";

function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 404) {
    return "The admin API is not available yet. The public dashboard still works.";
  }
  if (error instanceof ApiError) return error.message;
  return fallback;
}

function toInput(config: AdminConfig) {
  return {
    alertThresholdC: config.alertThresholdC,
    alertCooldownHours: config.alertCooldownHours,
    alertsEnabled: config.alertsEnabled,
    emailRecipients: config.emailRecipients.map((address) => address.trim()).filter(Boolean),
    probes: config.probes.map((probe) => {
      const next: LayoutProbe = {
        probeId: probe.probeId,
        label: probe.label.trim(),
        kind: probe.kind,
      };
      if (probe.kind === "grain") {
        next.row = probe.row;
        next.col = probe.col;
      }
      return next;
    }),
  };
}

function draftSnapshot(config: AdminConfig): string {
  return JSON.stringify(toInput(config));
}

let nextRecipientKey = 0;

function recipientKeys(count: number): number[] {
  return Array.from({ length: count }, () => nextRecipientKey++);
}

// Empty or partial number fields become NaN, which validateConfig reports.
function numberValue(value: number): number | "" {
  return Number.isNaN(value) ? "" : value;
}

function LoginForm({ expired, onSuccess }: { expired: boolean; onSuccess: (session: AdminSession) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await login(password);
      setPassword("");
      onSuccess(saveSession(result.token, result.expiresAt));
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) setError("Incorrect password.");
      else setError(messageFrom(err, "Could not sign in."));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="panel login-panel">
      <h2>Admin</h2>
      <p>Sign in with the shared password. The session lasts one hour and ends when you close this tab.</p>
      {expired ? (
        <p className="inline-error" role="alert">
          Your session expired. Sign in again.
        </p>
      ) : null}
      <form onSubmit={(event) => void onSubmit(event)}>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </section>
  );
}

function SettingsForm({
  session,
  onUnauthorized,
  onDirtyChange,
}: {
  session: AdminSession;
  onUnauthorized: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [saved, setSaved] = useState<AdminConfig | null>(null);
  const [draft, setDraft] = useState<AdminConfig | null>(null);
  const [recipientIds, setRecipientIds] = useState<number[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"save" | "test" | null>(null);

  const reset = useCallback((config: AdminConfig) => {
    const placed = { ...config, probes: ensureGrid(config.probes) };
    setSaved(placed);
    setDraft(placed);
    setRecipientIds(recipientKeys(placed.emailRecipients.length));
  }, []);

  useEffect(() => {
    let active = true;
    getAdminConfig(session.token)
      .then((config) => {
        if (!active) return;
        reset(config);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 401) onUnauthorized();
        else setError(messageFrom(err, "Could not load settings."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session.token, onUnauthorized, reset]);

  const errors = useMemo(() => (draft ? validateConfig(draft) : []), [draft]);
  const dirty = saved && draft ? draftSnapshot(saved) !== draftSnapshot(draft) : false;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  function update(patch: Partial<AdminConfig>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setError(null);
    setNotice(null);
  }

  function updateProbe(probeId: string, label: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            probes: current.probes.map((probe) => (probe.probeId === probeId ? { ...probe, label } : probe)),
          }
        : current,
    );
    setError(null);
    setNotice(null);
  }

  function chooseCell(probeId: string) {
    if (!draft) return;
    if (!selectedId || selectedId === probeId) {
      setSelectedId(selectedId === probeId ? null : probeId);
      return;
    }
    setDraft({ ...draft, probes: swapGrainPositions(draft.probes, selectedId, probeId) });
    setSelectedId(null);
    setError(null);
    setNotice(null);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!draft || errors.length > 0) return;
    setPending("save");
    setError(null);
    setNotice(null);
    try {
      const input = toInput(draft);
      const returned = await saveAdminConfig(session.token, input);
      reset(returned ?? (await getAdminConfig(session.token)));
      setNotice("Settings saved.");
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else setError(messageFrom(err, "Could not save settings."));
    } finally {
      setPending(null);
    }
  }

  async function onTest() {
    if (dirty) {
      setError("Save changes before sending a test alert.");
      return;
    }
    setPending("test");
    setError(null);
    setNotice(null);
    try {
      setNotice(await sendTestAlert(session.token));
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else setError(messageFrom(err, "Could not send a test alert."));
    } finally {
      setPending(null);
    }
  }

  if (loading) {
    return (
      <p className="muted-block" role="status">
        Loading settings…
      </p>
    );
  }
  if (!draft || !saved) {
    return (
      <section className="panel empty-state">
        <h2>Settings unavailable</h2>
        <p>{error ?? "Could not load admin settings."}</p>
      </section>
    );
  }

  const cells = gridCells(draft.probes);
  const air = draft.probes.find((probe) => probe.kind === "air");

  return (
    <form className="admin-form" onSubmit={(event) => void onSave(event)}>
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Alerts</h2>
            <p>A high scheduled grain reading emails every enabled recipient, then waits out the cooldown.</p>
          </div>
        </div>
        <div className="field-grid">
          <label>
            Threshold (°C)
            <input
              type="number"
              min={-10}
              max={60}
              step="0.1"
              value={numberValue(draft.alertThresholdC)}
              onChange={(event) => update({ alertThresholdC: event.target.valueAsNumber })}
            />
          </label>
          <label>
            Cooldown (hours)
            <input
              type="number"
              min={1}
              max={168}
              step="1"
              value={numberValue(draft.alertCooldownHours)}
              onChange={(event) => update({ alertCooldownHours: event.target.valueAsNumber })}
            />
          </label>
          <label className="check-field">
            <input
              type="checkbox"
              checked={draft.alertsEnabled}
              onChange={(event) => update({ alertsEnabled: event.target.checked })}
            />
            Alerts enabled
          </label>
        </div>
        <p className="fine">Last alert: {saved.lastAlertAt ? formatTimestamp(saved.lastAlertAt) : "Never"}</p>
        {saved.updatedAt ? <p className="fine">Settings updated {formatTimestamp(saved.updatedAt)}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Recipients</h2>
            <p>These addresses are stored by the API and are not shown on the public dashboard.</p>
          </div>
          <button
            type="button"
            className="button quiet"
            onClick={() => {
              update({ emailRecipients: [...draft.emailRecipients, ""] });
              setRecipientIds((ids) => [...ids, ...recipientKeys(1)]);
            }}
          >
            Add recipient
          </button>
        </div>
        {draft.emailRecipients.length === 0 ? <p className="muted-block">No recipients yet.</p> : null}
        <ul className="recipient-list">
          {draft.emailRecipients.map((address, index) => (
            <li key={recipientIds[index] ?? `extra-${index}`}>
              <input
                type="email"
                inputMode="email"
                autoComplete="off"
                placeholder="name@example.com"
                value={address}
                aria-label={`Recipient ${index + 1}`}
                onChange={(event) => {
                  const emailRecipients = draft.emailRecipients.map((item, itemIndex) =>
                    itemIndex === index ? event.target.value : item,
                  );
                  update({ emailRecipients });
                }}
              />
              <button
                type="button"
                className="button quiet"
                onClick={() => {
                  update({ emailRecipients: draft.emailRecipients.filter((_, itemIndex) => itemIndex !== index) });
                  setRecipientIds((ids) => ids.filter((_, itemIndex) => itemIndex !== index));
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Probe layout</h2>
            <p>Select a grain probe, then select another to swap their places. The air probe stays outside the grid.</p>
          </div>
        </div>
        <div className="editor-grid">
          {cells.map((probe, index) =>
            probe ? (
              <button
                key={probe.probeId}
                type="button"
                className={selectedId === probe.probeId ? "is-selected" : undefined}
                aria-pressed={selectedId === probe.probeId}
                onClick={() => chooseCell(probe.probeId)}
              >
                <span>{probe.label}</span>
                <small>{probe.probeId}</small>
              </button>
            ) : (
              <div key={`empty-${index}`} className="editor-empty">
                Empty
              </div>
            ),
          )}
        </div>
        <div className="label-list">
          {draft.probes
            .filter((probe) => probe.kind === "grain")
            .map((probe) => (
              <label key={probe.probeId}>
                {probe.probeId}
                <input value={probe.label} maxLength={40} onChange={(event) => updateProbe(probe.probeId, event.target.value)} />
              </label>
            ))}
          {air ? (
            <label>
              {air.probeId}
              <input value={air.label} maxLength={40} onChange={(event) => updateProbe(air.probeId, event.target.value)} />
            </label>
          ) : null}
        </div>
      </section>

      {errors.length > 0 ? (
        <ul className="error-list">
          {errors.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="submit" className="button" disabled={pending !== null || errors.length > 0 || !dirty}>
          {pending === "save" ? "Saving…" : "Save settings"}
        </button>
        <button type="button" className="button quiet" disabled={pending !== null} onClick={() => void onTest()}>
          {pending === "test" ? "Sending…" : "Send test alert"}
        </button>
      </div>
    </form>
  );
}

type LeaveAction = "back" | "logout";

export function AdminPanel({ onBack }: { onBack: () => void }) {
  const [session, setSession] = useState<AdminSession | null>(() => loadSession());
  const [expired, setExpired] = useState(false);

  const expire = useCallback(() => {
    clearSession();
    setSession(null);
    setExpired(true);
  }, []);

  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState<LeaveAction | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (session && !loadSession()) expire();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [expire, session]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function leave(action: LeaveAction) {
    setLeaving(null);
    if (action === "back") {
      onBack();
      return;
    }
    clearSession();
    setSession(null);
    setExpired(false);
  }

  function requestLeave(action: LeaveAction) {
    if (dirty) setLeaving(action);
    else leave(action);
  }

  return (
    <div className="admin">
      <div className="admin-bar">
        <p>{session ? "Signed in" : "View only until you sign in"}</p>
        <div className="admin-actions">
          <button type="button" className="button quiet" onClick={() => requestLeave("back")}>
            Back to dashboard
          </button>
          {session ? (
            <button type="button" className="button quiet" onClick={() => requestLeave("logout")}>
              Log out
            </button>
          ) : null}
        </div>
      </div>
      {leaving && dirty ? (
        <div className="banner leave-confirm" role="alert">
          <p>You have unsaved changes. Discard them?</p>
          <button type="button" className="button quiet" onClick={() => setLeaving(null)}>
            Keep editing
          </button>
          <button type="button" className="button" onClick={() => leave(leaving)}>
            Discard changes
          </button>
        </div>
      ) : null}
      {session ? (
        <SettingsForm session={session} onUnauthorized={expire} onDirtyChange={setDirty} />
      ) : (
        <LoginForm expired={expired} onSuccess={setSession} />
      )}
    </div>
  );
}
