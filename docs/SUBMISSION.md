# Submission notes

Maps each requirement to its code and tests, lists the checks I ran locally, and explains my design trade-offs.

## Requirement traceability

| Requirement | Code | Tests / proof |
|---|---|---|
| Login, logout, dealership-scoped list, admin edit form, persistence | `frontend/src/routes/*`, `backend/src/controllers/*`, `backend/src/services/*` | `frontend/src/workflow.test.tsx`, `backend/test/access-boundaries.test.ts` |
| Loading, invalid login, expired session, forbidden and API error states | `frontend/src/lib/{api,auth}.ts`, routes | `workflow.test.tsx` |
| Authentication, role checks and dealership scoping on every protected call | `backend/src/middleware/auth.ts`, `backend/src/repositories/vehicles.ts` | `auth.test.ts`, `access-boundaries.test.ts` (rejected writes leave data unchanged) |
| Atomic rejection of stale edits (409) | `backend/src/repositories/vehicles.ts` | `lost-update.regression.test.ts` |
| Regression test fails on the defect, passes on the fix | `backend/test/support/defective-repository.ts` | `npm run test:defect` fails, `npm test` passes, CI runs both |
| Seed: 2 dealerships, 6 users, 3+ vehicles each, hashed passwords | `backend/scripts/generate-seed.ts`, `backend/db/seed/seed.sql` | `password.test.ts` |
| Login rate limiting | `backend/src/services/auth.ts`, `backend/src/repositories/login-attempts.ts` | `auth.test.ts` (rate limiting) |
| Health endpoint without secrets | `backend/src/controllers/health.ts` | `health.test.ts`, smoke test |
| CI on pull requests, deploy only after checks pass on `main` | `.github/workflows/ci-cd.yml` | Runs on every pull request and push to `main` (Actions tab) |
| Smoke test after deploy | `devops/scripts/smoke-test.mjs` | Runs in the deploy job; each check is listed in the run summary |
| Release recovery | README, `.github/workflows/rollback.yml` | Documented; a live rollback was not required |

## Local verification (Node 22)

| Check | Result |
|---|---|
| Backend typecheck | Pass |
| Backend tests | 64 pass |
| `npm run test:defect` | Fails as expected (2 saves succeed instead of 1) |
| Frontend lint, typecheck, tests, build | Pass (13 tests) |
| Smoke test against `wrangler dev` with the built frontend | 13/13 pass |
| Seed regenerated | Identical to the committed file |

**Bug found by the smoke test.** The maximum allowed year was computed at module load. On Workers the clock reads 1970 at that point, so every real year was rejected. It is now computed per request, and a test covers it.

## Design trade-offs and next steps

- **Password hash cost.** PBKDF2 with 20,000 iterations is below the OWASP recommendation. Workers caps PBKDF2 at 100,000 iterations, and the free plan allows about 10 ms of CPU per request. The count is stored in each hash, so it can be raised later. Argon2id, or 100,000 iterations on a paid plan, would be better.
- **Single Worker for API and UI.** No CORS, the HttpOnly cookie works as is, and one rollback covers both. The cost is that they cannot be deployed separately.
- **Login rate limiting.** Counted in D1 per IP and per email. A Cloudflare WAF rate-limiting rule would be stronger.
- **Frontend tests.** They use a fake API. A real-browser end-to-end test (for example with Playwright) is the next thing I would add.
- **Not implemented.** Creating and deleting vehicles, sign-up and password reset (all optional).