# Peer Evaluation System - Deployment Guide

## Option 1: Render.com (Free tier available)

There are four Render services, a staging and a production instance of each
app -- see `render.yaml` for the full shape of each and
`.github/workflows/backend-ci-cd.yml`, `frontend-ci-cd.yml` and
`deploy-production.yml` for what deploys them:

| Service | Kind | URL | Deployed by |
|---|---|---|---|
| `peer-evaluation-backend-staging` | Docker web service | https://peer-evaluation-backend-staging.onrender.com | `backend-ci-cd.yml`, automatically, on every push whose backend tests pass |
| `peer-evaluation-frontend-staging` | Static site | https://peer-evaluation-frontend-staging.onrender.com | `frontend-ci-cd.yml`, automatically, on every push whose frontend tests pass |
| `peer-evaluation-backend-production` | Docker web service | https://peer-evaluation-backend-production.onrender.com | `deploy-production.yml`, only when a human runs it |
| `peer-evaluation-frontend-production` | Static site | https://peer-evaluation-frontend-production.onrender.com | `deploy-production.yml`, only when a human runs it |

In every case, Render's own git-push auto-deploy is OFF for all four
services; a GitHub Actions job triggers the actual deploy via that service's
Deploy Hook, only after that app's unit + integration tests pass. Set each
service's Deploy Hook URL as the matching GitHub Actions repo secret
(Settings -> Secrets and variables -> Actions):

- `RENDER_BACKEND_STAGING_DEPLOY_HOOK_URL`
- `RENDER_FRONTEND_STAGING_DEPLOY_HOOK_URL`
- `RENDER_BACKEND_PRODUCTION_DEPLOY_HOOK_URL`
- `RENDER_FRONTEND_PRODUCTION_DEPLOY_HOOK_URL`

(Render dashboard -> that service -> Settings -> Deploy Hook.)

### Backend Deployment (Docker):
Each backend deploys as a Docker-based Render Web Service, built from
`src/backend/Dockerfile`. `render.yaml` documents both (see it for the exact
env vars each needs); the easiest path to create them is New > Blueprint,
connect the repo, let Render read `render.yaml`, and fill in the env vars
marked `sync: false` during setup. `render.yaml`'s header explains why
syncing it won't adopt already-existing services of the same name.

Or configure one manually without the Blueprint:
1. Create a new "Web Service", connect the repo, turn Auto-Deploy Off
2. Set the runtime to "Docker"
3. Set Dockerfile path: `src/backend/Dockerfile`
4. Set Docker build context: `src/backend`
5. Add environment variables:
   - `NODE_ENV`: `staging` or `production`
   - `MONGODB_URI`: a MongoDB connection string -- staging should point at a
     database distinct from production's (e.g. append `peer-evaluation-staging`
     as the db name in the URI) so staging traffic and test data never touch
     real data; production should point at the same database the live app
     already uses
   - `SMTP_HOST`: Your email server (e.g., smtp.gmail.com)
   - `SMTP_PORT`: 587
   - `SMTP_USER`: Your email address
   - `SMTP_PASS`: Your email password/app password
   - `SMTP_FROM`: Your sender email
   - `FRONTEND_URL`: the matching frontend service's URL

### Frontend Deployment:
Both frontends are also defined in `render.yaml` as `runtime: static` sites,
so the Blueprint above creates them too. To configure one manually instead,
create a "Static Site" on Render with Auto-Deploy Off and:
1. Build command: `echo "$RENDER_GIT_COMMIT" > public/version.txt && npm install && npm run build`
   (run from the repo root -- `package.json` lives there, not under
   `src/frontend`; the `version.txt` step is how `frontend-ci-cd.yml` /
   `deploy-production.yml` confirm a deploy actually picked up the new
   commit, since a static site has nothing like the backend's `/api/health`)
2. Publish directory: `build`
3. Rewrite rule: `/*` -> `/index.html` (so client-side routes work)
4. Environment variables (baked in at build time -- see `src/frontend/
   config.js` -- so re-deploy the site after changing either):
   - `REACT_APP_API_URL`: the matching backend's URL plus `/api`
   - `REACT_APP_FRONTEND_URL`: this site's own URL
5. Then set that backend's `FRONTEND_URL` to this site's URL.

## Option 2: Vercel + Railway

### Frontend (Vercel - Free):
1. Go to vercel.com
2. Import your GitHub repository
3. Set root directory: `src/frontend`
4. Deploy automatically

### Backend (Railway - Free tier):
1. Go to railway.app
2. Connect GitHub repository
3. Deploy backend service
4. Add environment variables for email

## Option 3: Local with Real Email (Quick Test)

### Setup Gmail SMTP:
1. Enable 2-factor authentication on Gmail
2. Generate an "App Password"
3. Update your `.env` file:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
FRONTEND_URL=http://localhost:3000
```

## Option 4: Docker on another cloud provider

The backend's Dockerfile (`src/backend/Dockerfile`) is generic and also
runs on any Docker-capable host, not just Render:
- Google Cloud Run
- AWS ECS
- DigitalOcean App Platform

Build and run it locally to verify:
```bash
docker build -t peer-eval-backend ./src/backend
docker run -p 5000:5000 --env-file src/backend/.env peer-eval-backend
```

## Email Service Recommendations:
- **Development**: Gmail SMTP with app password
- **Production**: SendGrid, Mailgun, or AWS SES
- **Free tiers**: Most services offer free email sending quotas

## MongoDB Hosting:
- **Free**: MongoDB Atlas (512MB free tier)
- **Paid**: MongoDB Atlas, DigitalOcean Managed MongoDB

## Quick Start for Testing:
1. Use MongoDB Atlas (free)
2. Use Gmail SMTP (free)
3. Deploy to Render.com (free tier)
4. Test with real email addresses

Would you like me to help you set up any of these options?