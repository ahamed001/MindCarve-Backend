# Athma Mind Care — Backend

The API for **Athma Mind Care**, a patient assessment platform for a mental health hospital.

Patients register and complete standard mental-health questionnaires (BEIS-10, MHI-38, SCARED, ISAA, GDS-15, BFI-10). The backend stores their answers, calculates the scores, and gives hospital staff patient records, results, questionnaire editing with versions, printable reports, an activity feed and an audit log. It also sends welcome, invitation and password emails, and pushes live updates to open screens.

> This project was built as part of an interview process at **MindCarve**. It is meant to be cloned and run on your own machine.

## Tech stack

| What it's for | What it uses |
| --- | --- |
| Server & API | Node.js, Express 4 (ES modules) |
| Database | MongoDB with Mongoose 8. Published questionnaires are frozen as versions (v1, v2…), so past results never change |
| Login / session | JWT (jsonwebtoken) in an HttpOnly cookie, valid 8 hours. There is no refresh token: sign-out, password change, email change and deactivation end every session at once (a version number stored on the account) |
| Passwords | bcryptjs (hashed, never stored in plain text) |
| Request validation | express-validator |
| Security | helmet (headers), cors (allowed frontend URLs only), express-rate-limit (login and other auth routes) |
| Live updates | Socket.IO: signs in with the same cookie; staff get answers, activity and new patients live; patients get quiz-list changes; open tabs sign out when a session ends |
| Scoring | Own scoring engine on the server (sums, reverse scoring, subscales, cutoffs, bands) |
| Emails | Nodemailer over SMTP (sent in the background) |
| Report files | pdfkit (PDF), exceljs (Excel) |
| Audit | Append-only audit log (who did what, to whom, when) plus an activity feed |
| Tests | Node's built-in test runner, supertest, mongodb-memory-server |

## Run it locally

```bash
git clone <repository-url>
cd MindCarve-Backend
npm install
cp .env.example .env   # then fill in your own credentials
npm run seed:base      # first run only: admin account + the six assessments
npm run dev            # http://localhost:4500/api
npm test               # optional: runs the test suite on a throwaway database
```

Update `.env` with your own values:

- `MONGO_URI` and `DATABASE_NAME`: your MongoDB connection (make sure your IP is allowed in MongoDB Atlas). To try it without a database, leave `MONGO_URI` empty and set `USE_IN_MEMORY_DB=true`.
- `JWT_SECRET`: any long random string (32+ characters in production).
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: your email account, used to send emails (for Gmail, use an App Password).
- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`: the admin login created by the seed.
- `CLIENT_URL`: the frontend address(es), comma-separated. All are allowed by CORS and Socket.IO; the first is used in email links.

Run the frontend (`MindCarve-Frontend`) alongside it.

## Deploying

With the frontend on Vercel and this API on another host (Render, Railway…):

- `NODE_ENV=production`
- `CLIENT_URL=https://mind-carve-frontend.vercel.app`
- `COOKIE_SAME_SITE=none` (the default in production) so the login cookie works across the two sites. It needs HTTPS, which these hosts provide.
- The host must support WebSockets for live updates. Render and Railway do; Vercel serverless functions don't.
