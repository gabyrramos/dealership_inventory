# Dealership Inventory

A small inventory app for two made-up dealerships. Each user belongs to one dealership and is either an admin (can edit vehicles) or a viewer (read-only). If two admins edit the same vehicle at the same time, the second save is rejected instead of silently overwriting the first.

Repo: https://github.com/gabyrramos/dealership_inventory

## How it's built

```
Browser ──► one Cloudflare Worker
              ├─ /api/*  → Hono API (backend/) ──► D1 (SQLite)
              └─ /*      → React app (frontend/dist/client)
```

- **Frontend:** React Router 7 in SPA mode, Tailwind 4, shadcn/ui, TanStack Query.
- **Backend:** Hono on Cloudflare Workers, with zod for validation.
- **Database:** Cloudflare D1. It's free, and a single SQL statement is atomic, which is what the conflict check relies on.
- **Hosting:** one Worker serves both the API and the frontend. Everything is on one origin, so there's no CORS setup, the HttpOnly cookie just works, and a rollback covers both halves. The downside is that the API and the UI can't be deployed separately.

```
backend/              API, migrations, seed, tests
frontend/             React app and its tests
devops/scripts/       smoke test and release check used by CI
.github/workflows/    CI/CD, rollback, reset demo data
docs/SUBMISSION.md    where each requirement lives
```

## Running it locally

You need Node 22+.

```bash
# 1. Config. Fill in DEMO_PASSWORD in both files with the demo password (shared separately, not stored in this repo).
#    It must be the one the committed seed was generated with.
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. Backend on :8787
cd backend
npm ci
npm run db:reset:local
npm run dev

# 3. Frontend on :5005 (second terminal). It proxies /api to the backend.
cd frontend
npm ci
npm run dev
```

Then open http://localhost:5005. Both `.npmrc` files set `legacy-peer-deps=true` because `npm ci` fails on this dependency tree without it.

### Config

`.env` files are gitignored. Only the `.env.example` templates are committed.

| Name | File | What it's for |
|---|---|---|
| `DEMO_PASSWORD` | `backend/.env` | Password for the demo accounts. Used to build the seed and by the tests. |
| `PBKDF2_ITERATIONS` | `backend/.env` | Hash cost used when building the seed (default 20000). |
| `SESSION_TTL_SECONDS` | `backend/.env` locally, `wrangler.jsonc` in prod | How long a session lasts (default 8 hours). |
| `RELEASE` | `backend/.env` locally, set by CI in prod | Git SHA reported by `/api/health`. |
| `VITE_DEMO_PASSWORD` | `frontend/.env` | Shown in the "Demo accounts" box on the sign-in page. Leave it empty to hide the box. It ends up in the browser bundle. CI sets it for the tests only; the deployed build is made with it empty, so production has no demo box. |
| `DEV_PORT`, `API_URL` | `frontend/.env` | Vite dev server port and where to proxy `/api`. |

In GitHub (Settings > Secrets and variables > Actions):

| Name | Type | What it's for |
|---|---|---|
| `DEMO_PASSWORD` | variable | Same value as above. CI needs it for the tests, the seed check and the smoke test. It is not put in the deployed frontend build. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | secrets | For deploying. |
| `APP_URL` | variable, optional | Use this if CI can't work out the deployed URL from wrangler's output. |

## Tests and checks

| Command | What it does |
|---|---|
| `cd backend && npm test` | 64 API tests, run in the real Workers runtime against a local D1 |
| `cd backend && npm run typecheck` | TypeScript |
| `cd backend && npm run test:defect` | Runs the conflict test against a deliberately broken repository. It's supposed to fail. |
| `cd frontend && npm test` | 13 UI tests against a fake API |
| `cd frontend && npm run lint && npm run typecheck && npm run build` | Lint, types, build |
| `node --env-file=backend/.env devops/scripts/smoke-test.mjs` | End-to-end checks against a running app. Set `BASE_URL` to test a deployment. |

## Demo accounts

All six accounts use the same password. It is shared separately (not in this repo).

| Dealership | Admin | Second admin | Viewer |
|---|---|---|---|
| Sunrise Motors | admin1@sunrise.test | admin2@sunrise.test | viewer@sunrise.test |
| Lakeside Auto | admin1@lakeside.test | admin2@lakeside.test | viewer@lakeside.test |

Each dealership has 4 vehicles (`veh_sunrise_001` to `004`, `veh_lakeside_001` to `004`).

## Trying the edit conflict

In the browser: sign in as `admin1@sunrise.test` in a normal window and as `admin2@sunrise.test` in a private window. Open the same vehicle in both (both say "Version 1"). Save in the first window, then save something different in the second. The second window shows "Someone else updated this vehicle", disables Save, and offers a button to load the latest values.

With curl:

```bash
B=http://localhost:8787   # or the URL of a deployment
P='<your DEMO_PASSWORD>'
login() { curl -s -c "$1" -H 'content-type: application/json' -d "{\"email\":\"$2\",\"password\":\"$P\"}" $B/api/auth/login >/dev/null; }
login a.txt admin1@sunrise.test; login b.txt admin2@sunrise.test; login v.txt viewer@sunrise.test
put() { curl -s -w ' -> HTTP %{http_code}\n' -b "$1" -X PUT -H 'content-type: application/json' $B/api/vehicles/veh_sunrise_001 -d "$2"; }
put a.txt '{"make":"Toyota","model":"A-edit","year":2021,"status":"available","version":1}'   # 200
put b.txt '{"make":"Toyota","model":"B-edit","year":2021,"status":"available","version":1}'   # 409, stale
put v.txt '{"make":"X","model":"Y","year":2021,"status":"sold","version":2}'                   # 403, viewer
curl -s -b a.txt $B/api/vehicles/veh_lakeside_001                                              # 404, other dealership
curl -s $B/api/vehicles                                                                        # 401, not signed in
```

## The lost-update bug

- **The fix** (`backend/src/repositories/vehicles.ts`) is a single statement: `UPDATE ... SET ..., version = version + 1 WHERE id = ? AND dealership_id = ? AND version = ? RETURNING ...`. When two saves start from the same version, only one of them matches the row. The other changes nothing and gets a 409. If no row matched, a second query works out whether to return 409 or 404.
- **The broken version** (`backend/test/support/defective-repository.ts`, test-only) reads the version, checks it in JavaScript, then writes without a version condition. Both admins pass the check and the later save wins.
- **The test** (`backend/test/lost-update.regression.test.ts`) has 2 and then 6 sessions save at once. It checks that exactly one save succeeds, the rest get 409, the stored row matches the winning save, and the version went up by exactly one.
- `npm test` passes. `npm run test:defect` fails with `exactly one request must succeed: expected ... length of 1 but got 2`. CI runs both, so if the test ever stops catching the bug, the build fails.

## Auth

- Login checks a PBKDF2-SHA256 hash and creates a session in the database. The browser gets a random token in an `HttpOnly; SameSite=Lax` cookie (`Secure` on HTTPS). The database stores only the token's SHA-256.
- Every request looks up the user, role and dealership from the session. IDs in URLs are always combined with the session's dealership, so you can't reach another dealership's data by changing the URL.
- Checks run in this order: 401 (not signed in), 403 (not an admin), 400 (bad input), then 404 or 409.
- Another dealership's vehicle returns 404, not 403, so you can't tell it exists.
- Expired sessions return `401 session_expired` and the UI sends you back to sign in with a message.
- Logout deletes the session row, so a copied cookie stops working right away. Role changes apply on the next request.
- A wrong password and an unknown email get the same response and take about the same time.
- CSRF: the SameSite cookie, plus writes must be JSON and the API sends no CORS headers.

## Data

- Schema: `backend/migrations/0001_init.sql`.
- The seed (`backend/db/seed/seed.sql`) is generated by `npm run db:seed:generate`. The output is the same on every run, and CI fails if the committed file is out of date. It wipes the tables first, so running it again resets the demo.
  - Local reset: `npm run db:reset:local`
  - Remote reset: `npm run db:seed:remote`, or the "Reset demo data" workflow (type `RESET`)
- Hash cost: Workers allows at most 100,000 PBKDF2 iterations, and the free plan gives about 10 ms of CPU per request, so the default is 20,000. That's below OWASP's recommendation (see limitations). The count is stored in each hash, so it can be raised later.

## Deploying your own copy

1. Create a free Cloudflare account and a `workers.dev` subdomain if asked.
2. `cd backend && npx wrangler login && npx wrangler d1 create dealership-db`, then put the printed id in `backend/wrangler.jsonc`. It isn't a secret.
3. `npm run db:migrate:remote && npm run db:seed:remote`
4. Create a Cloudflare API token with **Workers Scripts: Edit** and **D1: Edit**, and note your account id.
5. In GitHub, add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and the variable `DEMO_PASSWORD`.
6. Push to `main`. CI runs the checks, migrates, deploys, waits for `/api/health` to report the new commit, then runs the smoke test. The URL appears in the run summary.

It's worth requiring the Backend and Frontend checks on pull requests (branch protection).

## CI/CD

- Pull requests run the backend and frontend checks. Pushes to `main` run the same checks, then deploy.
- The deploy job has `needs: [backend, frontend]`, so if either one fails, nothing gets deployed.
- The deploy uses the exact frontend build that passed the checks, runs D1 migrations, deploys with `RELEASE=<sha>`, then runs the health check and the smoke test.

## When a release goes wrong

- **Bad code:** run the Rollback workflow, or `cd backend && npx wrangler rollback`. This brings back the previous API and frontend together.
- **The database isn't rolled back.** Keep migrations backward compatible: add new columns first, and remove old ones only after the new code is live.
- **Bad data:** D1 Time Travel can restore the database to an earlier point (`npx wrangler d1 time-travel restore`). For demo data, just run "Reset demo data".
- Free tier limits to keep in mind: Workers allows 100k requests a day and 10 ms CPU per request. D1 allows 5M rows read and 100k rows written a day.

## Known limitations

- Login time on the Workers free plan (about 10 ms CPU per request) depends on the hash cost. If login ever fails with Cloudflare "Error 1102", lower `PBKDF2_ITERATIONS`, regenerate the seed and re-seed.
- 20k PBKDF2 iterations is weaker than OWASP recommends. A paid plan with 100k, or Argon2id, would be better.
- Login rate limiting is per IP and per email, counted in D1 (see `backend/src/services/auth.ts`). It is not a full lockout, and it is not as strong as a Cloudflare WAF rule.
- The demo accounts share one password and their emails are listed here, so anyone who has the password can sign in and edit the demo data.
- Sessions have a fixed lifetime. There's no sliding expiry or "sign out everywhere".
- Frontend tests use a fake API. There's no real-browser end-to-end test.
- Creating and deleting vehicles, sign-up and password reset aren't built (they were optional).
