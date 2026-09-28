import { useCallback, useEffect, useState } from "react";
import { ApiError, deletePushDevice, listPushDevices } from "../api/client";
import type { PushDevice } from "../api/types";
import { formatTimestamp } from "../lib/time";

interface Props {
  token: string;
  vapidPublicKey: string | null;
  onUnauthorized: () => void;
}

/** Admin view of every device that turned on notifications from the dashboard. */
export function NotificationsPanel({ token, vapidPublicKey, onUnauthorized }: Props) {
  const [devices, setDevices] = useState<PushDevice[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else setError(err instanceof Error && err.message ? err.message : fallback);
    },
    [onUnauthorized],
  );

  const refresh = useCallback(async () => {
    setDevices(await listPushDevices(token));
  }, [token]);

  useEffect(() => {
    refresh().catch((err: unknown) => fail(err, "Could not load notification devices."));
  }, [refresh, fail]);

  async function remove(id: string) {
    setPending(id);
    setError(null);
    try {
      await deletePushDevice(token, id);
    } catch (err: unknown) {
      if (!(err instanceof ApiError && err.status === 404)) fail(err, "Could not remove the device.");
    }
    try {
      await refresh();
    } catch (err: unknown) {
      fail(err, "Could not load notification devices.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Notification devices</h2>
          <p>
            Anyone can turn on notifications with the button at the bottom of the dashboard. Each device gets the same
            alerts as the email recipients, including test alerts. Remove any you do not recognise.
          </p>
        </div>
      </div>
      {!vapidPublicKey ? (
        <p className="inline-error">Push notifications are not configured on the Worker yet.</p>
      ) : null}

      {devices && devices.length > 0 ? (
        <ul className="recipient-list device-list">
          {devices.map((device) => (
            <li key={device.id}>
              <span>
                <strong>{device.label ?? device.service}</strong>
                <br />
                <small className="fine">
                  Added {formatTimestamp(device.createdAt)}
                  {device.lastSuccessAt ? ` · last delivered ${formatTimestamp(device.lastSuccessAt)}` : ""}
                </small>
              </span>
              <button
                type="button"
                className="button quiet"
                disabled={pending !== null}
                onClick={() => void remove(device.id)}
              >
                {pending === device.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      ) : devices ? (
        <p className="muted-block">No devices yet.</p>
      ) : null}

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
