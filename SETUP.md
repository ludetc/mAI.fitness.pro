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

> **Note on `database_id`:** `wrangler.toml` contains the deployed prod D1 id (`7ff735b0-89fc-4534-91aa-e5851f6de505`). Local wrangler dev uses the same `database_name` → its own local SQLite, so the remote id being set doesn't affect you locally.

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

## 8. Deploying to production

The Worker is already deployed at `https://mai-fitness-api.apexdiligence.workers.dev`. To push a new version:

```bash
cd apps/api
npm run deploy
```

This requires `wrangler login` once per machine (opens a browser for Cloudflare OAuth).

### Setting or rotating secrets

Never put secrets in `wrangler.toml` or commit them. Use `wrangler secret put`:

```bash
cd apps/api
npx wrangler secret put ANTHROPIC_API_KEY   # paste value at the prompt, not echoed
# for JWT_SECRET, pipe a generated value to keep it off your terminal history:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" | npx wrangler secret put JWT_SECRET
```

Rotating `JWT_SECRET` invalidates all existing session tokens (users will be kicked back to sign-in).

### Setting model overrides in prod

Non-secret vars live in `wrangler.toml [vars]`. The current prod overrides point `AI_MODEL_*` at the latest Anthropic IDs (Haiku 4.5 for chat, Sonnet 4.6 for planning) — the code-level defaults are TECH.md-era aliases that Anthropic retired in 2025.

To change a model:
1. Edit the value in `wrangler.toml [vars]`.
2. `npm run deploy` — takes a few seconds to propagate globally.

### Applying migrations to prod

```bash
cd apps/api
npx wrangler d1 migrations apply mai-db --remote
```

## 10. Personal / Collaborative Deployments

To deploy your own instance without modifying the tracked `wrangler.toml`:

1. **Create your own D1 Database:**
   ```bash
   npx wrangler d1 create mai-db-personal
   ```

2. **Create a private config file:**
   Create `apps/api/wrangler.personal.toml` (this is now gitignored). You only need to define the overrides:

   ```toml
   name = "mai-fitness-api-yourname"

   [[d1_databases]]
   binding = "DB"
   database_name = "mai-db-personal"
   database_id = "YOUR_NEW_DATABASE_ID"

   [vars]
   GOOGLE_CLIENT_ID = "YOUR_OWN_WEB_CLIENT_ID"
   AI_MODEL_CHAT = "openai/gpt-4o-mini"
   AI_MODEL_PLANNING = "openai/gpt-4o"
   ```

3. **Deploy using your private config:**
   ```bash
   cd apps/api
   npx wrangler deploy --config wrangler.personal.toml
   ```

4. **Set secrets for your instance:**
   ```bash
   npx wrangler secret put ANTHROPIC_API_KEY --config wrangler.personal.toml
   npx wrangler secret put JWT_SECRET --config wrangler.personal.toml
   ```

5. **Update Mobile App:**
   Point `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to your new deployment URL.

---

## 11. What's next

Refer to `ROADMAP.md` for the prioritised next-work list, which rolls up:
- Identified weaknesses from the latest code review
- Gaps against REQs.md that aren't implemented yet
- Scale-out concerns (testing, observability, rate-limiting)

Before extending the app, read `CLAUDE.md` — there are standing obligations around `DEV_NOTES.md` and `ARCHITECTURE.md` updates, and `AGENTS.md` describes the AI-feature design patterns used throughout the codebase.
