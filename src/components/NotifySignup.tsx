import { useEffect, useState } from "react";
import { getPushPublicKey, isPushSubscribed, subscribePush, unsubscribePush } from "../api/client";
import {
  currentSubscription,
  defaultDeviceLabel,
  notificationPermission,
  pushSupport,
  subscribeThisDevice,
  usesKey,
} from "../lib/push";

type State = "loading" | "hidden" | "off" | "on";

/** Public opt-in for alert notifications on the device viewing the dashboard. */
export function NotifySignup() {
  const [state, setState] = useState<State>("loading");
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const support = pushSupport();

  useEffect(() => {
    let active = true;
    let key: string | null = null;
    (async (): Promise<State> => {
      key = await getPushPublicKey();
      if (!key) return "hidden";
      if (active) setVapidKey(key);
      const subscription = await currentSubscription();
      // The browser may still hold a subscription that an admin removed or an old key made.
      if (!subscription || !usesKey(subscription, key)) return "off";
      return (await isPushSubscribed(subscription.endpoint)) ? "on" : "off";
    })()
      .then((next) => {
        if (active) setState(next);
      })
      .catch(() => {
        // Notifications are an extra: if the status check fails, still offer the button.
        if (active) setState(key ? "off" : "hidden");
      });
    return () => {
      active = false;
    };
  }, []);

  async function run(action: () => Promise<{ next: State; message: string }>, fallback: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const { next, message } = await action();
      setState(next);
      setNotice(message);
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : fallback);
    } finally {
      setPending(false);
    }
  }

  function turnOn() {
    if (!vapidKey) return;
    void run(async () => {
      const subscription = await subscribeThisDevice(vapidKey);
      await subscribePush(subscription.toJSON(), defaultDeviceLabel());
      return { next: "on", message: "Done. A confirmation notification should arrive in a moment." };
    }, "Could not turn on notifications.");
  }

  function turnOff() {
    void run(async () => {
      const subscription = await currentSubscription();
      if (subscription) {
        await unsubscribePush(subscription.endpoint);
        await subscription.unsubscribe();
      }
      return { next: "off", message: "Notifications are off for this device." };
    }, "Could not turn off notifications.");
  }

  if (state === "loading" || state === "hidden") return null;

  const blocked = notificationPermission() === "denied";
  let text: string;
  if (state === "on") text = "This device will get a notification when the grain gets too warm.";
  else if (support === "ios-needs-install")
    text =
      "On iPhone or iPad, first tap Share → Add to Home Screen, then open Wheat Temp from the Home Screen and turn notifications on there.";
  else if (support === "unsupported") text = "This browser cannot show notifications. Try Chrome, Edge, Firefox or Safari.";
  else if (blocked)
    text = "Notifications are blocked for this site. Allow them in your browser's site settings, then reload this page.";
  else text = "Get a notification on this phone or computer when the grain gets too warm.";

  const canTurnOn = support === "supported" && !blocked;

  return (
    <section className="panel notify-panel">
      <div className="panel-head">
        <div>
          <h2>Temperature alerts</h2>
          <p>{text}</p>
        </div>
        {state === "on" ? (
          <button type="button" className="button quiet" disabled={pending} onClick={turnOff}>
            {pending ? "Turning off…" : "Turn off"}
          </button>
        ) : canTurnOn ? (
          <button type="button" className="button" disabled={pending} onClick={turnOn}>
            {pending ? "Turning on…" : "Turn on notifications"}
          </button>
        ) : null}
      </div>
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
