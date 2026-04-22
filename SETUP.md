# Setup

End-to-end local setup for mAI.fitness.pro. Expect 30–60 minutes the first time (most of it is Google Cloud Console).

---

## 0. Prerequisites

- **Node.js** ≥ 20 (LTS recommended)
- **npm** ≥ 10 (ships with Node)
- A **Google account** with access to [Google Cloud Console](https://console.cloud.google.com)
- **Expo Go** app on your phone (iOS or Android) for on-device testing, OR a browser (`w` mode works for OAuth-only testing)
- A **Cloudflare account** is NOT required for local development — wrangler runs D1 locally against SQLite. You only need a Cloudflare account when deploying.

---

## 1. Clone & install

```bash
git clone https://github.com/ludetc/mAI.fitness.pro.git
cd mAI.fitness.pro
npm install
```

This installs all three workspaces (`@mai/api`, `@mai/mobile`, `@mai/shared`) in one pass.

---

## 2. Google Cloud Console — OAuth clients

The app signs users in with Google. You need three OAuth 2.0 Client IDs in the **same GCP project**: one for iOS, one for Android, and one Web Client ID that the Worker validates against.

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create (or reuse) a project.
2. Navigate to **APIs & Services → OAuth consent screen**.
   - Choose **External** user type (unless your org is a Google Workspace).
   - Fill in app name (`mAI.fitness`), support email, developer email.
   - On scopes, keep `openid`, `profile`, `email`.
   - Add your own Google account as a **test user** while the app is in testing mode.
3. Navigate to **APIs & Services → Credentials → Create credentials → OAuth client ID**, and create **three** clients:
   - **iOS**
     - Bundle ID: `fr.apexdiligence.maifitness` (match `apps/mobile/app.json` → `expo.ios.bundleIdentifier`).
   - **Android**
     - Package name: `fr.apexdiligence.maifitness` (match `apps/mobile/app.json` → `expo.android.package`).
     - SHA-1: for Expo Go use the generic Expo development fingerprint, or when using a dev build, run `eas credentials` and copy the SHA-1 from there.
   - **Web application**
     - Authorized redirect URIs (at least one of):
       - `https://auth.expo.io/@your-expo-username/mai-fitness-pro` (for Expo Go)
       - `http://localhost:8081` (for web dev)
       - `maifitness:/oauthredirect` (for native dev builds using the scheme)
4. Copy the three client IDs.

---

## 3. Configure the Worker (`apps/api`)

Edit `apps/api/wrangler.toml`:

```toml
[vars]
GOOGLE_CLIENT_ID = "your-web-client-id.apps.googleusercontent.com"  # the Web client from step 2
ALLOWED_ORIGINS = "http://localhost:8081,http://localhost:19006,https://auth.expo.io"
```

Create `apps/api/.dev.vars` (gitignored) from the template:

```bash
cp apps/api/.dev.vars.example apps/api/.dev.vars
```

Set `JWT_SECRET` to a random string ≥ 32 bytes (e.g. `openssl rand -hex 32`).

Apply the D1 migrations locally:

```bash
npm run migrate:local -w @mai/api
```

This creates a local SQLite database at `apps/api/.wrangler/state/v3/d1/` with the `users` table.

> **Note on `database_id`:** `wrangler.toml` ships with a placeholder UUID. For local dev this is fine — wrangler just needs the field to exist. When you're ready to deploy, run `wrangler d1 create mai-db` and paste the real ID in.

---

## 4. Configure the mobile app (`apps/mobile`)

Copy the env template:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Fill in all four vars:

```
EXPO_PUBLIC_API_URL=http://localhost:8787
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=...apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=...apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=...apps.googleusercontent.com
```

> **Testing on a physical device?** Replace `localhost` with your machine's LAN IP (e.g. `http://192.168.1.10:8787`), and add that origin to `ALLOWED_ORIGINS` in `wrangler.toml`.

---

## 5. Run it

Two terminals, both in the repo root.

**Terminal 1 — Worker:**

```bash
npm run dev:api
```

→ Worker on `http://localhost:8787`. Verify: `curl http://localhost:8787/health` returns `{"ok":true}`.

**Terminal 2 — Expo:**

```bash
npm run dev:mobile
```

→ scan the QR code with Expo Go, or press `w` to open in a browser.

---

## 6. Smoke test the auth flow

1. Tap **Continue with Google** on the sign-in screen.
2. Complete OAuth in the browser popup.
3. The app should land on the home screen showing your email.
4. Verify the DB row:
   ```bash
   cd apps/api
   npx wrangler d1 execute mai-db --local --command "SELECT id, email, google_sub FROM users;"
   ```
5. Kill and relaunch Expo — you should remain signed in (JWT is persisted in `expo-secure-store`).
6. Tap **Sign out** — you should land back on the sign-in screen. Relaunch confirms you're still signed out.

If the OAuth redirect loops or you get a `redirect_uri_mismatch`, double-check that the redirect URI in the Google Cloud Console Web client matches exactly what Expo reports in the terminal (usually printed when you first attempt sign-in).

---

## 7. Useful commands

| Command | Runs |
|---|---|
| `npm run typecheck` | TypeScript checks across all three workspaces |
| `npm run dev:api` | Worker with hot reload |
| `npm run dev:mobile` | Expo dev server |
| `npm run migrate:local -w @mai/api` | Apply D1 migrations to local SQLite |
| `npx wrangler d1 execute mai-db --local --command "…"` | Query local D1 directly |

---

## 8. What's next

Pass 1 ends here. The remaining roadmap phases (AI provider abstraction, onboarding, equipment audit, workout planning, real-time sessions, notifications, design polish) are documented in `ARCHITECTURE.md` under "Future-phase integration points".

Before extending the app, read `CLAUDE.md` — there are standing obligations around `DEV_NOTES.md` and `ARCHITECTURE.md` updates.
