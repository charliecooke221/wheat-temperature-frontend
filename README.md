# wheat-temperature-frontend

Dashboard for the wheat-store temperature hub. It is a static Vite, React and TypeScript site for GitHub Pages. The browser calls the Cloudflare Worker over HTTPS. No secrets live in this repository.

Public pages:

- 3×3 grain layout inside a store outline, with two gaps in the bottom edge
- air in that same section, with its own latest reading and 24-hour range
- stale, missing and disconnected states
- hourly, daily, weekly and monthly chart
- per-probe lines, plus grain average, grain maximum, and a dashed air line

Admin (phase C3 API):

- shared-password login; the one-hour token stays in `sessionStorage`
- logout, and return to the login screen on expiry or HTTP 401
- rearrange the 3×3 grid, edit labels, set the alert threshold, cooldown, enabled flag and recipients
- send a test alert

Web push is intentionally not included yet.

## Local development

```powershell
npm install
npm run dev
```

Open http://localhost:5173/wheat-temperature-frontend/

The dev server uses port 5173 because the Worker currently allows that origin. By default the app calls:

```text
https://wheat-temperature-api.charliecooke221.workers.dev
```

To use a local Worker instead, create `.env.local`:

```text
VITE_API_BASE_URL=http://127.0.0.1:8787
```

## Production build

```powershell
npm run build
```

`vite.config.ts` sets `base` to `/wheat-temperature-frontend/`, which matches:

```text
https://charliecooke221.github.io/wheat-temperature-frontend/
```

`.github/workflows/pages.yml` builds `dist/` and deploys it with GitHub Actions. One-time repository settings:

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. The Worker `ALLOWED_ORIGIN` must include `https://charliecooke221.github.io`. The browser origin does not include the repository path. Local Vite uses `http://localhost:5173`, and both origins are listed together, separated by a comma.

## Admin API contract

The dashboard already uses `GET /api/v1/summary` and `GET /api/v1/readings`. Admin screens call these routes, which phase C3 still has to implement. Errors use `{ "ok": false, "error": "...", "message": "..." }`.

`POST /api/v1/auth/login`

```json
{ "password": "shared-password" }
```

```json
{ "ok": true, "token": "<signed-token>", "expiresAt": "2026-09-23T16:00:00Z" }
```

`GET` and `PUT /api/v1/admin/config` use a bearer token. `PUT` accepts the editable fields and should return the saved config:

```json
{
  "ok": true,
  "alertThresholdC": 25,
  "alertCooldownHours": 24,
  "alertsEnabled": false,
  "timezone": "Europe/London",
  "emailRecipients": ["name@example.com"],
  "lastAlertAt": null,
  "updatedAt": "2026-09-23T12:00:00Z",
  "probes": [
    { "probeId": "grain-01", "label": "Grain 1", "kind": "grain", "row": 0, "col": 0 },
    { "probeId": "air-01", "label": "Air", "kind": "air" }
  ]
}
```

`timezone`, `lastAlertAt` and `updatedAt` are read-only. Calibration offsets are not edited here.

`POST /api/v1/admin/alert-test` with `{}` sends a test message to the saved recipients.
