import { useCallback, useEffect, useState } from "react";
import { ApiError, deletePushDevice, listPushDevices, savePushDevice } from "../api/client";
import type { PushDevice } from "../api/types";
import {
  currentSubscription,
  defaultDeviceLabel,
  notificationPermission,
  pushSupport,
  storedDeviceId,
  storeDeviceId,
  subscribeThisDevice,
} from "../lib/push";
import { formatTimestamp } from "../lib/time";

interface Props {
  token: string;
  vapidPublicKey: string | null;
  onUnauthorized: () => void;
}

async function ignoreMissing(promise: Promise<void>): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
}

export function NotificationsPanel({ token, vapidPublicKey, onUnauthorized }: Props) {
  const support = pushSupport();
  const [devices, setDevices] = useState<PushDevice[] | null>(null);
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fail = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof ApiError && err.status === 401) onUnauthorized();
      else setError(err instanceof Error && err.message ? err.message : fallback);
    },
    [onUnauthorized],
  );

  const refresh = useCallback(async () => {
    const [list, subscription] = await Promise.all([listPushDevices(token), currentSubscription()]);
    const stored = storedDeviceId();
    const active = subscription !== null && stored !== null && list.some((device) => device.id === stored);
    setDevices(list);
    setThisDeviceId(active ? stored : null);
  }, [token]);

  useEffect(() => {
    refresh().catch((err: unknown) => fail(err, "Could not load notification devices."));
  }, [refresh, fail]);

  async function run(action: () => Promise<string>, fallback: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
      await refresh();
    } catch (err: unknown) {
      fail(err, fallback);
    } finally {
      setPending(false);
    }
  }

  function enable() {
    if (!vapidPublicKey) return;
    void run(async () => {
      const subscription = await subscribeThisDevice(vapidPublicKey);
      const id = await savePushDevice(token, subscription.toJSON(), defaultDeviceLabel());
      storeDeviceId(id);
      return "Notifications are on for this device. Use “Send test alert” to check.";
    }, "Could not turn on notifications.");
  }

  function remove(id: string) {
    void run(async () => {
      await ignoreMissing(deletePushDevice(token, id));
      if (id === storedDeviceId()) {
        const subscription = await currentSubscription();
        await subscription?.unsubscribe();
        storeDeviceId(null);
        return "Notifications are off for this device.";
      }
      return "Device removed.";
    }, "Could not remove the device.");
  }

  let status: string;
  if (!vapidPublicKey) status = "Push notifications are not configured on the Worker yet.";
  else if (support === "ios-needs-install")
    status = "On iPhone or iPad, add this site to the Home Screen (Share → Add to Home Screen), open it from there, then turn notifications on.";
  else if (support === "unsupported") status = "This browser does not support push notifications.";
  else if (notificationPermission() === "denied")
    status = "Notifications are blocked for this site. Allow them in the browser's site settings to turn them on.";
  else if (thisDeviceId) status = "This device receives alert notifications.";
  else status = "This device does not receive alert notifications.";

  const canEnable = Boolean(vapidPublicKey) && support === "supported" && notificationPermission() !== "denied";

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Phone and browser notifications</h2>
          <p>Optional. Sent alongside the alert email. Email remains the main alert.</p>
        </div>
        {thisDeviceId ? (
          <button type="button" className="button quiet" disabled={pending} onClick={() => remove(thisDeviceId)}>
            Turn off here
          </button>
        ) : (
          <button type="button" className="button quiet" disabled={pending || !canEnable} onClick={enable}>
            {pending ? "Working…" : "Turn on for this device"}
          </button>
        )}
      </div>
      <p className="fine">{status}</p>

      {devices && devices.length > 0 ? (
        <ul className="recipient-list device-list">
          {devices.map((device) => (
            <li key={device.id}>
              <span>
                <strong>{device.label ?? device.service}</strong>
                {device.id === thisDeviceId ? " (this device)" : ""}
                <br />
                <small className="fine">
                  Added {formatTimestamp(device.createdAt)}
                  {device.lastSuccessAt ? ` · last delivered ${formatTimestamp(device.lastSuccessAt)}` : ""}
                </small>
              </span>
              <button type="button" className="button quiet" disabled={pending} onClick={() => remove(device.id)}>
                Remove
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
      {notice ? (
        <p className="notice" role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
