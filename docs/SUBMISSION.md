# Submission notes

Where each requirement lives in the code, what I checked on my machine, and the trade-offs I made.

## Where each requirement lives

| Requirement | Code | Tests / proof |
|---|---|---|
| Login, logout, dealership-scoped list, admin edit form, data persists | `frontend/src/routes/*`, `backend/src/controllers/*`, `backend/src/services/*` | `frontend/src/workflow.test.tsx`, `backend/test/access-boundaries.test.ts` |
| Loading, bad login, expired session, forbidden and API error states | `frontend/src/lib/{api,auth}.ts`, routes | `workflow.test.tsx` |
| Auth, role checks and dealership scoping on every protected call | `backend/src/middleware/auth.ts`, `backend/src/repositories/vehicles.ts` | `auth.test.ts`, `access-boundaries.test.ts` (checks rejected writes leave the data untouched) |
| Stale edits rejected atomically (409) | `backend/src/repositories/vehicles.ts` | `lost-update.regression.test.ts` |
| Regression test fails on the bug, passes on the fix | `backend/test/support/defective-repository.ts` | `npm run test:defect` fails, `npm test` passes, CI checks both |
| Seed: 2 dealerships, 6 users, 3+ vehicles each, hashed passwords | `backend/scripts/generate-seed.ts`, `backend/db/seed/seed.sql` | `password.test.ts` |
| Login rate limiting | `backend/src/services/auth.ts`, `backend/src/repositories/login-attempts.ts` | `auth.test.ts` (rate limiting section) |
| Health endpoint with no secrets | `backend/src/controllers/health.ts` | `health.test.ts`, smoke test |
| CI on PRs, deploy only after checks pass on main | `.github/workflows/ci-cd.yml` | Runs on every pull request and push to `main` (Actions tab) |
| Smoke test after deploy | `devops/scripts/smoke-test.mjs` | Runs in the deploy job; each check is listed in the run summary |
| Release recovery | README, `.github/workflows/rollback.yml` | Documented. A live rollback wasn't required. |

## Checked locally (Node 22)

| Check | Result |
|---|---|
| Backend typecheck | pass |
| Backend tests | 64 pass |
| `npm run test:defect` | fails as expected (2 saves succeed instead of 1) |
| Frontend lint, typecheck, tests, build | pass, 13 tests |
| Smoke test against `wrangler dev` with the built frontend | 13/13 |
| Seed file regenerated | identical to the committed one |

One bug only the smoke test caught: the max allowed year was computed when the module loaded. On Workers the clock reads 1970 at that point, so every real year was rejected. It's now computed per request, and a test covers it.

## Trade-offs and next steps

- **Hash cost:** PBKDF2 with 20,000 iterations is below OWASP's recommendation. Workers caps PBKDF2 at 100,000 iterations and the free plan gives about 10 ms of CPU per request. The count is stored in each hash, so it can be raised later. Argon2id or 100,000 iterations on a paid plan would be better.
- **One Worker for API and UI:** no CORS, the HttpOnly cookie just works, and a rollback covers both. The cost is that they can't be deployed separately.
- **Login rate limiting** is counted in D1 per IP and per email. A Cloudflare WAF rate-limit rule would be stronger.
- **UI tests use a fake API.** A real-browser end-to-end test (for example with Playwright) is the next thing I would add.
- **Not built:** creating and deleting vehicles, sign-up, password reset (they were optional).
