# Athma Mind Care Hospital — Backend API

Express + MongoDB (Mongoose) API for the Athma patient assessment platform: authentication, patients, assessments
and versioning, patient responses, the scoring engine, reports and the activity log.
The web app lives in the separate `MindCarve-Frontend` project.

## Quick start

```bash
npm install
cp .env.example .env        # then fill in the values (see below)
npm run seed                # first time only: admin, the six instruments, dev patient
npm run dev                 # http://localhost:4500/api
```

- `npm run seed -- --demo` also adds fictional demo patients, results and activity (never in production).
- `npm test` runs the scoring unit tests and API tests against a throwaway in-memory MongoDB (your real database is never touched).

### MongoDB Atlas

Set `MONGO_URI` (or `DATABASE_URL`) and `DATABASE_NAME`. Atlas only accepts connections from allowed IPs — add your
machine under **Atlas → Security → Network Access**, otherwise you will see *"Could not connect to any servers in your
MongoDB Atlas cluster"*.

For local development without installing MongoDB, leave `MONGO_URI` empty and set `USE_IN_MEMORY_DB=true`. A local
MongoDB starts automatically and stores its data in `.dev-db/` (git-ignored), so data and logins **survive restarts**.
It is seeded once, on first start. To reset it, stop the server and delete the `.dev-db` folder. Set
`DEV_DB_PATH=memory` for a throwaway database that is wiped on every restart.

### Development accounts

Created by `npm run seed` from the `SEED_*` variables (development only):

| Portal | URL (frontend) | Email | Password |
| --- | --- | --- | --- |
| Admin | `/admin/login` | `SEED_ADMIN_EMAIL` | `SEED_ADMIN_PASSWORD` |
| Patient | `/login` | `SEED_PATIENT_EMAIL` | `SEED_PATIENT_PASSWORD` |
| Clinician (with `--demo`) | `/admin/login` | `clinician@athma.local` | `Clinician@123` |

In production the seed refuses weak admin passwords (< 12 characters) and never creates the dev patient.

## Environment variables (`.env`)

| Variable | Purpose |
| --- | --- |
| `PORT` | API port (default 5000; this project uses 4500) |
| `MONGO_URI` / `DATABASE_URL` | MongoDB / Atlas connection string |
| `DATABASE_NAME` | Database name (e.g. `mindcarve`) |
| `USE_IN_MEMORY_DB` | `true` = local dev MongoDB when no connection string is set (development only) |
| `DEV_DB_PATH` | Folder for the local dev DB (default `.dev-db`); `memory` = wiped on every restart |
| `JWT_SECRET` | Token signing secret — at least 32 random characters in production |
| `JWT_EXPIRES_IN` | Session lifetime (default `8h`) |
| `CLIENT_URL` / `FRONTEND_URL` | Frontend origin (CORS) and base for links in emails (default `http://localhost:5173`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Email delivery. If unset in development, emails are saved to `dev-mail/*.html` instead |
| `INVITATION_TTL_HOURS`, `RESET_TTL_MINUTES` | Invitation / password-reset link lifetimes |
| `APP_TIMEZONE` | Day/week boundaries on the dashboard (default `Asia/Kolkata`) |
| `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Admin created by the seed |
| `SEED_PATIENT_NAME`, `SEED_PATIENT_EMAIL`, `SEED_PATIENT_PASSWORD` | Development patient created by the seed |

## Project structure

```
src/
  app.js, server.js          Express app and startup
  config/                    env + database connection
  middleware/                auth (JWT cookie), roles, validation, rate limit, errors
  routes/index.route.js      mounts every module under /api
  auth/  users/  patients/  assessments/  questions/  assignments/
  responses/  results/  scoring/  reports/  activity/  dashboard/  notes/  emails/
  seed/                      seed script + the six instruments transcribed from the reference documents
tests/                       scoring.test.js, api.test.js
```

Each module follows `model / service / controller / route`. Every response uses `{ success, message, data }`.

## Main flows

- **Patient self-registration** (`POST /api/auth/register`): the patient chooses a password and accepts the declaration; a welcome email with the Patient ID, login email and a login link is sent. Passwords are never emailed.
- **Staff-registered patients** receive a single-use, expiring invitation link to set their password.
- **Take a Quiz** (`GET /api/me/quizzes`, `POST /api/me/quizzes/:assessmentId/start`): every published assessment is listed; starting reuses the patient's open attempt or creates one from the current published version.
- **Answers save on every click** (`PUT /api/me/assignments/:id/responses`) with one atomic update per answer, so concurrent saves never lose data. Submission is atomic and can happen only once.
- **Attempt IDs** (`ATT-<patient number>-<attempt>`) identify each attempt; staff look up results with `GET /api/assignments/attempt/:code`.

## Security model

- bcrypt password hashing; invitation/reset tokens are random, stored only as SHA-256 hashes, single-use and expiring.
- JWT in an HttpOnly cookie (`SameSite=strict` + `Secure` in production). Logout and password changes invalidate all existing sessions.
- Roles enforced on every route (`admin`, `clinician`, `patient`). Patients can only reach their own records; others return 404.
- Patients never receive option scores, scoring rules, sensitivity markers, clinician notes or results.
- Rate-limited auth endpoints, `helmet`, JSON body limit, `Cache-Control: no-store`, `express-validator` on all input.
- Reports (identifiable data) are admin-only. Sensitive actions are recorded in the activity log.

## Assessments, versioning and scoring

- Assessments are **read-only through the API** for now (create / edit / publish endpoints were removed). The seed publishes version 1 of each instrument as an immutable snapshot; attempts always keep the version they started with.
- `src/scoring/scoringEngine.js` is configuration-driven: option scores, yes/no keys, reverse scoring (`constant − score`), excluded items, sum/mean subscales, cutoffs and bands with risk levels. Incomplete answers never produce totals.

| Code | Items | Scoring status |
| --- | --- | --- |
| ISAA | 40, 6 domains | Total + classification bands + separate disability-% table |
| SCARED-P | 41 (parent version) | 5 subscale cutoffs + total ≥ 25 |
| BFI-10 | 10 | Reverse items 1, 3, 4, 5, 7; trait means with benchmarks; no clinical risk |
| GDS-15 | 15 yes/no | Answers marked bold/italic in the source score 1; 0–5 normal, > 5 suggests depression |
| MHI-38 | 38 | **Awaiting configuration** — subscale mapping stored, item-scoring step missing from the source |
| BEIS-10 | 10 | 5 two-item subscales + total (matches the source sample report: 38) |

Source issues awaiting clinician confirmation:

1. **ISAA** — classification bands and the disability-% table use different boundaries; the % table has no row below 70. Both kept unchanged.
2. **MHI-38** — item-level recoding not supplied; stated directionality conflicts with raw option codes. No norms or cutoffs.
3. **SCARED** — "a score of N" vs "Cutoff = N" implemented as ≥ N. Only parent-version items supplied.
4. **BEIS-10** — percentile norms not supplied; raw scores only.
5. **GDS** — the self-rated form page referenced in the instructions was not supplied.
6. **Risk levels** used on the dashboard (ISAA Mild → moderate, Moderate/Severe → high; SCARED total ≥ 25 → high; GDS > 5 → high) are defaults to be confirmed.

## Deployment

Set `NODE_ENV=production`, a strong `JWT_SECRET`, the database variables, SMTP settings and `CLIENT_URL`, and serve over
HTTPS. Development fallbacks (in-memory DB, `dev-mail`, links returned in API responses) are disabled in production.
