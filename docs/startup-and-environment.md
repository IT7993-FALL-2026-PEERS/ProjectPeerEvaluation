# Startup and environment reference

**Owner:** Laeticia Neno Aloyem (M3) — Requirements, QA, security & documentation
**Milestone:** 2 (5 Oct – 1 Nov 2026), review 26 Oct
**Gantt task:** Dev Environment & Containerization — *"Write startup & environment documentation"*
**Last updated:** 14 October 2026

## What this page is for

Every environment variable PEERS reads, in one place: what it does, whether it is required,
what happens when it is missing, and what to set it to locally, in Docker and on staging.

It does not replace the two existing startup paths — the README's
[Getting Started](../README.md#getting-started-for-new-users) for `npm run dev`, and
[Docker setup](docker-setup.md) for containers. Use either. This page is the reference you
reach for when a variable is wrong, unset, or you are standing up a new environment and
need to know what to fill in.

## 1. Three `.env` files, deliberately separate

A common first confusion: there is more than one, and they are not interchangeable.

| File | Used by | Created by | Committed? |
|---|---|---|---|
| `src/backend/.env` | `npm run dev` — the backend process on your machine | `npm run setup`, from `src/backend/.env.example` | No |
| `.env` (repo root) | `docker compose` / `npm run docker:up` | `npm run setup`, from `.env.example` | No |
| Render dashboard | Staging | Entered once when the Blueprint is applied | n/a — values marked `sync: false` in `render.yaml` are never in the repo |

`npm run setup` creates both local files and writes a **random** `JWT_SECRET` into each, so
a fresh clone starts without anyone having to invent a secret.

A real `src/backend/.env` used to be committed to this repository (defect D-01 in the
technical assessment). It was removed, and `.gitignore` now covers `.env` — but it is worth
knowing, because anyone who cloned before that still has it on disk.

## 2. The variables

### Required

| Variable | What it does | If missing | Local | Docker | Staging |
|---|---|---|---|---|---|
| `MONGODB_URI` | Database connection string | Backend cannot connect; `/api/health` returns 503 | `mongodb://localhost:27017/peer-eval` | `DOCKER_MONGODB_URI`, default `mongodb://mongo:27017/peer-eval` | MongoDB Atlas string, entered by hand (`sync: false`) |
| `JWT_SECRET` | Signs professor login tokens | **Development:** warns and falls back to `dev_secret_key`, so `npm run dev` still works. **Production:** the app refuses to start. Under 32 characters in production is also a hard stop | Random, written by `npm run setup` | Required — Compose will not start without it, because the container runs `NODE_ENV=production` | `generateValue: true` — Render generates it |

The development fallback is in `src/backend/config/env.js`. It is a convenience, not a
safety net: `NODE_ENV=production` turns both cases into errors.

### Email

Invitations and reminders need all five. Without them the app runs, but no student ever
receives a link.

| Variable | What it does | Local | Staging |
|---|---|---|---|
| `SMTP_HOST` | Mail server hostname | `smtp.gmail.com`, or Mailtrap | Mailtrap sandbox only (`sync: false`) |
| `SMTP_PORT` | Mail server port | `587` | `sync: false` |
| `SMTP_USER` | Mail account username | your address | `sync: false` |
| `SMTP_PASS` | Mail account password or app password | an app password, never your real one | `sync: false` |
| `SMTP_FROM` | Address students see as the sender | your address | `sync: false` |

**Staging refuses any transport but the Mailtrap sandbox** (CICD-44). That is deliberate:
staging must never be able to email a real student.

### Frontend and API addresses

| Variable | What it does | If wrong | Local | Staging |
|---|---|---|---|---|
| `FRONTEND_URL` | Builds the evaluation links in emails, **and** is the only origin CORS allows | Links look fine but go nowhere; or the frontend's API calls are blocked by CORS | `http://localhost:3000` | `https://peers-frontend-staging.onrender.com` |
| `FRONTEND_API_URL` *(Docker)* | API base URL baked into the frontend image at **build** time | The built image calls the wrong API; rebuilding is the only fix | `http://localhost:5000/api` | n/a |
| `REACT_APP_API_URL` *(Render)* | Same idea for the staging frontend | As above | n/a | `https://peers-backend-staging.onrender.com/api` |

A wrong `FRONTEND_URL` is the single most common cause of "it deployed but nothing works":
the emailed links and the CORS allow-list both come from it. Since CICD-37, CORS allows only
this origin — no wildcard.

### Optional, with defaults

All of these work unset. The default is what the code uses.

| Variable | Default | What it does | When to change it |
|---|---|---|---|
| `EMAIL_SEND_INTERVAL_MS` | `0` | Pause between emails in a batch | Mailtrap's free sandbox allows one email per 10 seconds — staging uses `11000` |
| `EVALUATION_TOKEN_TTL_DAYS` | `14` | How long a student's link works after the latest invitation or reminder | Shorten for a tight evaluation window |
| `SESSION_IDLE_MINUTES` | `60` | Professor session ends after this long with no request; activity renews it | Sponsor decision on FR-04 |
| `SESSION_MAX_HOURS` | `8` | Hard ceiling on a session since login, regardless of activity | As above |
| `TRUST_PROXY` | `2` | How many proxies sit in front of the app, so rate limits see the real client | `0` when running with no proxy. Leave unset on Render — it has two (Cloudflare and its load balancer) |

### Rate limits

Per client address. Optional whole numbers above zero; anything else is ignored and the
default stands. Full detail in [api-documentation.md](architecture/api-documentation.md), section 1.

| Variable | Default | Applies to |
|---|---|---|
| `RATE_LIMIT_LOGIN_MAX` | 10 per 15 min | Failed logins |
| `RATE_LIMIT_SIGNUP_MAX` | 10 per hour | Registrations |
| `RATE_LIMIT_RESET_MAX` | 5 per hour | Password reset requests |
| `RATE_LIMIT_UPDATE_MAX` | 20 per hour | Password updates via a reset link |
| `RATE_LIMIT_EVALUATE_MAX` | 600 per 15 min | Student evaluation link requests |
| `RATE_LIMIT_GENERAL_MAX` | 1000 per 15 min | Everything else |

### Set by the platform

Do not set these by hand locally.

| Variable | Where | Value |
|---|---|---|
| `NODE_ENV` | Containers and Render | `production` — this is what makes `JWT_SECRET` mandatory |
| `NODE_VERSION` | Render | `24`, kept in step with `.nvmrc` |
| `DEPLOY_ENV` | Render | `staging` |
| `FRONTEND_PORT` / `BACKEND_PORT` / `MONGO_PORT` | Compose | `3000` / `5000` / `27017` |

## 3. Starting it up

### Local, without Docker

```
git clone https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation.git
cd ProjectPeerEvaluation
npm run setup      # checks Node, creates both .env files with a random JWT_SECRET, installs
```

**You also need MongoDB running** — `npm run dev` does not start one, and this step is easy
to miss because the setup script does not mention it. Either install MongoDB locally, or:

```
docker run -d --name peers-dev-mongo -p 27017:27017 mongo:8
```

Then:

```
npm run dev        # backend on :5000, frontend on :3000
```

Confirm both came up:

```
bash scripts/verify-env.sh
```

It waits for each service and names whichever one is down, rather than leaving you to guess.

### Local, with Docker

```
npm run docker:up
```

Three services start in order, each waiting for the previous to report healthy:
`mongo` → `backend` → `frontend`. See [docker-setup.md](docker-setup.md).

### Staging

Not started by hand. The CD pipeline deploys it after CI passes; Render's auto-deploy is
off. See [cd-pipeline.md](cd-pipeline.md) and
[operations/release-procedure.md](operations/release-procedure.md).

## 4. When it will not start

| Symptom | Cause | Fix |
|---|---|---|
| `⚠️ JWT_SECRET is not set` in the log, app still runs | No `JWT_SECRET` in development | Harmless locally. Run `npm run setup` to generate one |
| App exits: `Invalid configuration: JWT_SECRET is not set` | `NODE_ENV=production` without a secret | Set one, at least 32 characters |
| App exits: `JWT_SECRET is too short` | Under 32 characters in production | `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `/api/health` returns 503 | MongoDB unreachable | Is it running? Check `MONGODB_URI` in `src/backend/.env` |
| Frontend loads, every API call fails | `FRONTEND_URL` does not match where the frontend is served from, so CORS blocks it | Make them match |
| Students get links that go nowhere | `FRONTEND_URL` was wrong when the emails were sent | Fix it and re-send; existing emails cannot be corrected |
| Emails stop partway through a batch | Provider rate limit | Set `EMAIL_SEND_INTERVAL_MS` (Mailtrap sandbox: `11000`) |
| Compose refuses to start | No `JWT_SECRET` in the root `.env` | `npm run setup`, or add one by hand |
| Rate limits trigger for everyone at once | `TRUST_PROXY` wrong, so every request looks like it comes from the proxy | `0` with no proxy; unset on Render |

## 5. Known friction

Recorded here rather than fixed silently, because each one is a decision for someone.

**MongoDB is not in the setup path.** `npm run setup` prepares everything except a database.
A new developer follows the README, runs `npm run dev`, and gets a connection error. Aaron's
[dev-environment review](dev-environment-review.md) hit exactly this on a clean clone.
Either the README's step 3 should include starting MongoDB, or `npm run setup` should offer
to start the Compose `mongo` service.

**Copying `.env.example` over an existing `.env` loses your settings.** The README's
configure step says to copy the example file, which silently overwrites whatever you had.
`npm run setup` is the safer path and should be the documented one.

**Three `.env` files is genuinely confusing.** It is correct — `npm run dev` and Compose
need different values for the same name — but it needs saying out loud, which is why it is
section 1 of this page.

## Related

- [README: Getting Started](../README.md#getting-started-for-new-users) — the `npm run dev` path
- [Docker setup](docker-setup.md) — the container path
- [Development environment review](dev-environment-review.md) — M2's clean-clone validation
- [Operations runbook](operations/README.md) — running, releasing and rolling back
- [Security policy](security/security-policy.md) — secret handling and the scanning gates
- [API documentation](architecture/api-documentation.md) — rate limit detail
