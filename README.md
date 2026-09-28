# wheat-temperature-frontend

Dashboard for the wheat-store temperature hub. It is a static Vite, React and TypeScript site for GitHub Pages. The browser calls the Cloudflare Worker over HTTPS.


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

## Admin

The **Admin** button opens the settings screen. It signs in with the shared password
(`POST /api/v1/auth/login`) and keeps the one-hour token in `sessionStorage`, so closing
the tab ends the session. It edits the probe layout and labels, alert threshold,
cooldown, on/off switch and email recipients (`GET`/`PUT /api/v1/admin/config`), and
sends a test alert (`POST /api/v1/admin/alert-test`). The Worker README lists the full
API.

## Push notifications

`public/sw.js` is a small service worker that only shows push notifications. It does
not cache anything. `public/manifest.webmanifest` lets phones install the site.

On the admin screen, **Turn on for this device** asks for notification permission.
It then subscribes with the Worker's VAPID public key and saves the subscription through
`POST /api/v1/admin/push-subscriptions`. The same list shows every registered device
with a **Remove** button.

- Android / desktop Chrome, Edge and Firefox work from the normal site.
- iPhone / iPad (iOS 16.4+) only allow push after **Share → Add to Home Screen**. Open
  the site from the Home Screen icon, sign in to Admin and turn notifications on there.
- If permission was denied, the browser's site settings must be changed. The site
  cannot ask again.

Email is still the main alert. Push is sent from the same alert event and is not retried.
