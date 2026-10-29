# Dealership Inventory

I created a small inventory app for two dealerships with different accounts according to the role needed for this test. Each user belongs to one dealership and is either an admin (can edit vehicles) or a viewer (read-only). If two admins edit the same vehicle at the same time, the second save is rejected instead of silently overwriting the first which is the main problem to target.

- Live app: https://dealership-inventory.gabyr-contact.workers.dev
- Repo: https://github.com/gabyrramos/dealership_inventory
- CI/CD runs: https://github.com/gabyrramos/dealership_inventory/actions

## How it's built

```
Browser ──► one Cloudflare Worker
              ├─ /api/*  → Hono API (backend/) ──► D1 (SQLite)
              └─ /*      → React app (frontend/dist/client)
```

- **Frontend:** React Router 7 in SPA mode, Tailwind 4, shadcn/ui, TanStack Query.
- **Backend:** Hono on Cloudflare Workers, with zod for validation.
- **Database:** Cloudflare D1. 
- **Hosting:** one Worker serves both the API and the frontend. 

```
backend/              API, migrations, seed, tests
frontend/             React app and its tests
devops/scripts/       smoke test and release check used by CI
.github/workflows/    CI/CD, rollback, reset demo data
docs/SUBMISSION.md    where each requirement lives
```

## Running it locally

Node 22+ is required

```bash
# 1. Config. Fill in DEMO_PASSWORD in both files with the demo password I shared in my email

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
| `VITE_DEMO_PASSWORD` | `frontend/.env` | Same value as `DEMO_PASSWORD`. The tests need it. Anything starting with `VITE_` ends up in the browser bundle, so CI builds the deployed frontend with it empty and production has no demo accounts box. |
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
| `cd backend && npm test` | API tests run in the real Workers runtime against a local D1 |
| `cd backend && npm run typecheck` | TypeScript |
| `cd backend && npm run test:defect` | Runs the conflict test against a deliberately broken repository, it's supposed to fail. |
| `cd frontend && npm test` | 13 UI tests against a fake API |
| `cd frontend && npm run lint && npm run typecheck && npm run build` | Lint, types, build |
| `node --env-file=backend/.env devops/scripts/smoke-test.mjs` | End-to-end checks against a running app. Set `BASE_URL` to test a deployment. |

## Demo accounts

All six accounts use the same password which is provided in my email.

| Dealership | Admin | Second admin | Viewer |
|---|---|---|---|
| Sunrise Motors | admin1@sunrise.test | admin2@sunrise.test | viewer@sunrise.test |
| Lakeside Auto | admin1@lakeside.test | admin2@lakeside.test | viewer@lakeside.test |

Each dealership has 4 vehicles (`veh_sunrise_001` to `004`, `veh_lakeside_001` to `004`).

## Trying the edit conflict

In the browser: sign in as `admin1@sunrise.test` in a normal window and as `admin2@sunrise.test` in a private window. To test saving edits for a same vehicle open the same vehicle in both. Save your changes in the first window, then save different changes in the second. The second window shows "Someone else updated this vehicle", it also disables Save, and offers a button to load the latest values.

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

## Concurrency control (lost updates)

**Issue.** Two admins open the same vehicle and both save. The second save can overwrite the first one without anyone noticing.

**Implementation** (`backend/src/repositories/vehicles.ts`). The version check and the write happen in one SQL statement:

```sql
UPDATE vehicles SET ..., version = version + 1
WHERE id = ? AND dealership_id = ? AND version = ?
RETURNING ...
```

If two saves start from the same version, only one matches the row. The other changes nothing and gets a 409. When no row matches, a second query decides between 409 and 404.

**Defective variant** (`backend/test/support/defective-repository.ts`, tests only). It reads the version, checks it in code, then writes without checking again. Both admins pass the check and the later save wins.

**Regression test** (`backend/test/lost-update.regression.test.ts`). Two sessions, then six, save at the same time. The test checks that:
- exactly one save succeeds and the rest get 409
- the stored row matches the winning save
- the version goes up by exactly one

**Results**
- `npm test` passes.
- `npm run test:defect` fails with `exactly one request must succeed: expected ... length of 1 but got 2`.
- CI runs both. If the test stops catching the bug, the build fails.

## Authentication and authorization

- Login checks a PBKDF2-SHA256 password hash and creates a session in the database.
- The browser gets a random token in an `HttpOnly; SameSite=Lax` cookie (`Secure` on HTTPS). The database stores only the token's SHA-256.
- Every request looks up the user, role and dealership from the session. A URL id is always combined with the session's dealership, so changing the URL never reaches another dealership's data.
- Checks run in this order: 401 (not signed in), 403 (not an admin), 400 (bad input), then 404 or 409.
- A vehicle from another dealership returns 404, not 403, so its existence stays hidden.
- An expired session returns `401 session_expired`, and the UI sends the user back to sign in with a message.
- Logout deletes the session row, so a copied cookie stops working immediately.
- A role change applies on the next request.
- A wrong password and an unknown email get the same response in about the same time.
- CSRF: SameSite cookie, JSON-only writes, and no CORS headers.

## Database and seed data

- Schema: `backend/migrations/0001_init.sql`.
- Seed: `backend/db/seed/seed.sql`, generated by `npm run db:seed:generate`. The output is identical on every run, and CI fails if the committed file is out of date. The seed wipes the tables first, so running it again resets the demo.
  - Local reset: `npm run db:reset:local`
  - Remote reset: `npm run db:seed:remote`, or the "Reset demo data" workflow (type `RESET`)
- Password hash cost: Workers allows at most 100,000 PBKDF2 iterations, and the free plan gives about 10 ms of CPU per request. The default is 20,000, which is below the OWASP recommendation (see Known limitations). The count is stored inside each hash, so it can be raised later.

## Cloudflare deployment

1. Create a free Cloudflare account. Register a `workers.dev` subdomain if asked.
2. Run `cd backend && npx wrangler login && npx wrangler d1 create dealership-db`. Put the printed id in `backend/wrangler.jsonc`. The id is not a secret.
3. Run `npm run db:migrate:remote && npm run db:seed:remote`.
4. Create a Cloudflare API token with **Workers Scripts: Edit** and **D1: Edit**. Note your account id.
5. In GitHub, add the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, and the variable `DEMO_PASSWORD`.
6. Push to `main`. CI runs the checks, migrates, deploys, waits for `/api/health` to report the new commit, and runs the smoke test. The URL is in the run summary.

Recommended: enable branch protection and require the Backend and Frontend checks on pull requests.

## CI/CD pipeline

- Pull requests run the backend and frontend checks.
- Pushes to `main` run the same checks and then deploy.
- The deploy job has `needs: [backend, frontend]`. If either fails, nothing is deployed.
- The deploy uses the same frontend build that passed the checks. It runs the D1 migrations, deploys with `RELEASE=<sha>`, then runs the health check and the smoke test.

## Release recovery

- **Code:** run the Rollback workflow, or `cd backend && npx wrangler rollback`. This restores the previous API and frontend together.
- **Database schema:** migrations are not rolled back with the code. Keep them backward compatible: add new columns first and remove old ones only after the new code is live.
- **Data:** D1 Time Travel can restore the database to an earlier point (`npx wrangler d1 time-travel restore`). For demo data, run "Reset demo data".

## Known limitations

- Login speed on the Workers free plan depends on the hash cost. If login fails with Cloudflare "Error 1102", lower `PBKDF2_ITERATIONS`, regenerate the seed and re-seed.
- 20,000 PBKDF2 iterations is weaker than OWASP recommends. A paid plan with 100,000, or Argon2id, would be better.
- Login attempts are limited per IP and per email, counted in D1 (`backend/src/services/auth.ts`). This is not a full lockout, and it is weaker than a Cloudflare rate-limiting rule.
- All demo accounts share one password and their emails are public. Anyone with the password can sign in and edit the demo data.
- Sessions have a fixed lifetime. There is no sliding expiry and no "sign out everywhere".
- Frontend tests use a fake API. There is no real-browser end-to-end test.
- Creating and deleting vehicles, sign-up and password reset are not built (they were optional).