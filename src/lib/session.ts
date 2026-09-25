const STORAGE_KEY = "wheat.admin.session";
const TOKEN_LIFETIME_MS = 60 * 60 * 1000;

export interface AdminSession {
  token: string;
  expiresAt: number;
}

export function loadSession(): AdminSession | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    if (typeof parsed.token !== "string" || typeof parsed.expiresAt !== "number") {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (Date.now() >= parsed.expiresAt) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return { token: parsed.token, expiresAt: parsed.expiresAt };
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function saveSession(token: string, expiresAt?: string): AdminSession {
  const parsed = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const session: AdminSession = {
    token,
    expiresAt: Number.isFinite(parsed) ? parsed : Date.now() + TOKEN_LIFETIME_MS,
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
