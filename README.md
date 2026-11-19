# Athma Mind Care — Backend

The API for **Athma Mind Care**, a patient assessment platform for a mental health hospital.

Patients register and complete standard mental-health questionnaires (BEIS-10, MHI-38, SCARED, ISAA, GDS-15, BFI-10). The backend stores their answers, calculates the scores, and gives hospital staff patient records, results, printable reports, an activity feed and an audit log. It also sends welcome and password-reset emails.

Built with Node.js, Express and MongoDB.

> This project was built as part of an interview process at **MindCarve**. It is meant to be cloned and run on your own machine.

## Run it locally

```bash
git clone <repository-url>
cd MindCarve-Backend
npm install
cp .env.example .env   # then fill in your own credentials
npm run seed:base      # first run only: admin account + the six assessments
npm run dev            # http://localhost:4500/api
```

Update `.env` with your own values:

- `MONGO_URI` and `DATABASE_NAME`: your MongoDB connection (make sure your IP is allowed in MongoDB Atlas). To try it without a database, leave `MONGO_URI` empty and set `USE_IN_MEMORY_DB=true`.
- `JWT_SECRET`: any long random string.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`: your email account, used to send emails (for Gmail, use an App Password).
- `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`: the admin login created by the seed.
- `CLIENT_URL`: the frontend address (default `http://localhost:5173`).

Run the frontend (`MindCarve-Frontend`) alongside it.
