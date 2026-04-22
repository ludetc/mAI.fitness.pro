# Next Steps

Your resume-from-here checklist. Written 2026-04-22. Once you've completed Step 6 successfully, delete this file (or keep it as a record; your call).

---

## Current state (where you left off)

- ✅ Prod Worker deployed: `https://mai-fitness-api.[your-subdomain].workers.dev`
- ✅ Remote D1 `mai-db` provisioned, all 4 migrations applied
- ✅ Prod secrets set: `ANTHROPIC_API_KEY`, `JWT_SECRET`
- ✅ Prod `AI_MODEL_*` vars set to current Anthropic IDs (Haiku 4.5, Sonnet 4.6)
- ✅ Old compromised Anthropic key **revoked** at console.anthropic.com
- ❌ `GOOGLE_CLIENT_ID` in `wrangler.toml` still placeholder — **blocks every real sign-in**
- ❌ `apps/mobile/.env` not created yet — mobile app has no client IDs or API URL

The one gating dependency is Google OAuth. Once you finish the steps below, the whole product loop (sign in → onboard → generate plan → do session → regenerate) will work end-to-end against prod.

---

## Step 1. Google Cloud OAuth setup (~15 min)

Open https://console.cloud.google.com.

- [ ] **Create (or pick) a GCP project.** Top-left project dropdown → **New Project** → name `mai-fitness` → Create → select it.

- [ ] **Configure OAuth consent screen.** Left sidebar → **APIs & Services** → **OAuth consent screen**.
  - User type: **External** → Create.
  - App name: `mAI.fitness`
  - User support email + Developer email: `b.hunalp@rhreflex.com`
  - Save and Continue.
  - Scopes: add `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Save and Continue.
  - Test users: add `b.hunalp@rhreflex.com`. Save and Continue.
  - Back to Dashboard.

- [ ] **Create three OAuth 2.0 Client IDs.** Left sidebar → **Credentials** → **Create credentials** → **OAuth client ID** (three times).

  **iOS client:**
  - Application type: iOS
  - Name: `mAI.fitness iOS`
  - Bundle ID: `com.mai.fitness.pro` (matches `apps/mobile/app.json` → `expo.ios.bundleIdentifier`)
  - Create → copy the id.

  **Android client:**
  - Application type: Android
  - Name: `mAI.fitness Android`
  - Package name: `com.mai.fitness.pro`
  - SHA-1 (generic Expo Go dev fingerprint):
    ```
    A5:88:41:A5:32:A1:B4:E5:AB:33:2F:5C:54:7F:99:DD:A1:F7:6A:72
    ```
  - Create → copy the id.

  **Web application client** (the one the Worker verifies against):
  - Application type: Web application
  - Name: `mAI.fitness Web`
  - Authorized redirect URIs — add all three:
    - `https://auth.expo.io/@your-expo-username/mai-fitness-pro`
      (replace `your-expo-username` with your `expo` CLI login. To check: `cd apps/mobile && npx expo whoami`. If "Not logged in": `npx expo login` once.)
    - `http://localhost:8081`
    - `maifitness:/oauthredirect`
  - Create → copy the id.

- [ ] Save the three client IDs to a scratchpad file (not in the repo).

---

## Step 2. Wire the Web client ID into the deployed Worker

```cmd
cd C:\Users\BerfayHunalp\mAI.fitness.pro\apps\api
```

- [ ] Open `wrangler.toml` in a text editor.
- [ ] Replace:
  ```toml
  GOOGLE_CLIENT_ID = "REPLACE_WITH_GOOGLE_OAUTH_WEB_CLIENT_ID"
  ```
  with your **Web** client ID (not iOS, not Android):
  ```toml
  GOOGLE_CLIENT_ID = "1234567890-abc.apps.googleusercontent.com"
  ```
- [ ] Save.
- [ ] Redeploy:
  ```cmd
  npx wrangler deploy
  ```
  Should take ~10 seconds. Output ends with `https://mai-fitness-api.[your-subdomain].workers.dev`.

---

## Step 3. Wire all three client IDs into the mobile app

```cmd
cd C:\Users\BerfayHunalp\mAI.fitness.pro\apps\mobile
copy .env.example .env
```

- [ ] Open `apps\mobile\.env` in a text editor.
- [ ] Fill the four vars:
  ```
  EXPO_PUBLIC_API_URL=https://mai-fitness-api.[your-subdomain].workers.dev
  EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=<iOS id>.apps.googleusercontent.com
  EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=<Android id>.apps.googleusercontent.com
  EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=<Web id>.apps.googleusercontent.com
  ```
- [ ] Save.

---

## Step 4. Launch the mobile app

From the repo root:

```cmd
cd C:\Users\BerfayHunalp\mAI.fitness.pro
npm run dev:mobile
```

- [ ] Press `w` in the Expo terminal to open the web version (fastest path for the first test).
- [ ] Or install **Expo Go** on your phone and scan the QR code.

---

## Step 5. Walk through the product

- [ ] **Sign in.** Tap "Continue with Google" → sign in with `b.hunalp@rhreflex.com`. You should land on a home screen showing your email.
- [ ] **Start discovery.** Tap "Start discovery" → chat for ~2 minutes. The AI asks about goals, availability, current activity, health, personality. At some point it silently calls `save_profile` and drops you back home showing the profile summary.
- [ ] **Generate plan.** Tap "Generate this week". Takes ~10-20 seconds (Claude Sonnet 4.6). Plan screen opens with per-session cards.
- [ ] **Start a session.** Tap "Start this session" on any day. Log a set → rest timer starts. Repeat.
- [ ] **Swap an exercise.** Tap "Swap" on an exercise → pick reason → Claude Haiku suggests an alternative → "Use swap". Exercise name updates, swap marker appears.
- [ ] **Finish.** Complete all sets → "Finish session" → post-session summary appears.
- [ ] **Regenerate.** Back to plan screen → "Regenerate plan". The new plan's `summary` should mention the progression decision informed by the session you just logged.

If all six steps pass, the product is live end-to-end.

---

## Step 6. Debug (if something breaks)

Open a second CMD window and tail the prod Worker's logs:

```cmd
cd C:\Users\BerfayHunalp\mAI.fitness.pro\apps\api
npx wrangler tail
```

All requests stream there with errors + stacks.

| Symptom | Likely cause | Fix |
|---|---|---|
| Sign-in popup never returns / `redirect_uri_mismatch` | Web client redirect URIs don't match what Expo actually uses | Expo terminal prints `Opening auth session at <URL>` — copy the host+path and add it to the Web client's authorized redirect URIs in GCP |
| `missing_bearer` on `/me` after sign-in | `EXPO_PUBLIC_API_URL` wrong, or the `idToken` POST to `/auth/google` failed | Check network tab (web only) for POST `/auth/google`; check `.env` value |
| `invalid_id_token` on `/auth/google` | `GOOGLE_CLIENT_ID` in `wrangler.toml` doesn't match the Web client you're signing in with | Confirm the three IDs in `.env` are from the same GCP project and `GOOGLE_CLIENT_ID` is the **Web** one |
| `ai_not_configured` on `/workouts/generate` | `ANTHROPIC_API_KEY` secret not attached to the deployed Worker | `cd apps\api && npx wrangler secret list` — you should see `ANTHROPIC_API_KEY`. If missing, `npx wrangler secret put ANTHROPIC_API_KEY` and redeploy |
| `anthropic chat failed: 404` | Model ID alias deprecated | Check `wrangler.toml [vars]` — `AI_MODEL_CHAT` and `AI_MODEL_PLANNING` must be set |
| Plan generation hangs > 60s | `fetch` to Anthropic stuck | Tail output will show the timeout. Retry once; if persistent check Anthropic status page |

---

## When it works

- Tell me "done" and I'll start knocking out 🔴 items from `ROADMAP.md §1`. The top-priority one is rate-limiting on AI endpoints — without it a leaked JWT can run up your Anthropic bill very quickly.

## If you want to skip GCP setup for now

Not a great idea — sign-in is the entry point to every other feature. But if you want to test the Worker side in isolation, you can seed a user manually and mint a dev JWT against a known `JWT_SECRET`. I already documented that path in `DEV_NOTES.md` under `2026-04-22 — deploy-to-cloudflare-prod` → Follow-ups.

---

## Cleanup when done

- [ ] Delete this file (`NEXT_STEPS.md`) once the product works.
- [ ] Take a screenshot of the working plan-generation UI for the README (optional).
- [ ] Consider setting Google OAuth consent screen to "In production" once you're done testing (moves it out of the test-users limitation).
