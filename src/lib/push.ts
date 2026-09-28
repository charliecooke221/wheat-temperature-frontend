// Browser side of Web Push: service worker registration and this device's subscription.

const DEVICE_ID_KEY = "wheat.push.deviceId";

export type PushSupport = "supported" | "unsupported" | "ios-needs-install";

function isIos(): boolean {
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || iPadOs;
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (supported) return "supported";
  // iPhone and iPad only expose Web Push to sites added to the Home Screen.
  if (isIos() && !isStandalone()) return "ios-needs-install";
  return "unsupported";
}

export function notificationPermission(): NotificationPermission {
  return "Notification" in window ? Notification.permission : "denied";
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const base = import.meta.env.BASE_URL;
  await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== "supported") return null;
  const existing = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL);
  return existing ? existing.pushManager.getSubscription() : null;
}

function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const padded = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function sameKey(subscription: PushSubscription, vapidPublicKey: string): boolean {
  const current = subscription.options.applicationServerKey;
  if (!current) return false;
  const expected = keyBytes(vapidPublicKey);
  const actual = new Uint8Array(current);
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index]);
}

/**
 * Asks for permission (only ever called from a button press) and returns this browser's
 * subscription, replacing one made with an old server key.
 */
export async function subscribeThisDevice(vapidPublicKey: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked for this site. Allow them in the browser settings, then try again."
        : "Notification permission was not granted.",
    );
  }

  const reg = await registration();
  const existing = await reg.pushManager.getSubscription();
  if (existing && sameKey(existing, vapidPublicKey)) return existing;
  if (existing) await existing.unsubscribe();

  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(vapidPublicKey),
  });
}

export function defaultDeviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Android/.test(ua)
    ? "Android"
    : isIos()
      ? "iPhone/iPad"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "Mac"
          : /Linux/.test(ua)
            ? "Linux"
            : "Device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  return `${browser} on ${os}`;
}

// The server id of this browser's subscription, so the device list can mark "this device".
export function storedDeviceId(): string | null {
  try {
    return localStorage.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

export function storeDeviceId(id: string | null): void {
  try {
    if (id) localStorage.setItem(DEVICE_ID_KEY, id);
    else localStorage.removeItem(DEVICE_ID_KEY);
  } catch {
    // Storage can be unavailable (private mode); the list simply will not mark this device.
  }
}
