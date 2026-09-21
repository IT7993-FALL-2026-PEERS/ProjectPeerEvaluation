# Peer Evaluation System - Deployment Guide

## Option 1: Render.com (Free tier available)

### Backend Deployment (Docker):
The backend deploys as a Docker-based Render Web Service, built from
`src/backend/Dockerfile`. A `render.yaml` Blueprint at the repo root
defines this service, so the easiest path is:
1. Create account at render.com
2. New > Blueprint, connect your GitHub repository, and let Render read
   `render.yaml`. It will create a Web Service with `runtime: docker`,
   `dockerfilePath: ./src/backend/Dockerfile`, `dockerContext: ./src/backend`.
3. Render prompts for the environment variables marked `sync: false`
   (secrets below) during Blueprint setup.

Or configure it manually without the Blueprint:
1. Create a new "Web Service", connect the repo
2. Set the runtime to "Docker"
3. Set Dockerfile path: `src/backend/Dockerfile`
4. Set Docker build context: `src/backend`
5. Add environment variables:
   - `MONGODB_URI`: Your MongoDB connection string
   - `SMTP_HOST`: Your email server (e.g., smtp.gmail.com)
   - `SMTP_PORT`: 587
   - `SMTP_USER`: Your email address
   - `SMTP_PASS`: Your email password/app password
   - `SMTP_FROM`: Your sender email
   - `FRONTEND_URL`: Your frontend URL (after frontend deployment)

### Frontend Deployment:
The frontend is also defined in `render.yaml` as a `runtime: static` site
(`peer-evaluation-frontend`), so the Blueprint above creates it too. To
configure it manually instead, create a "Static Site" on Render with:
1. Build command: `npm install && npm run build` (run from the repo root --
   `package.json` lives there; there is no `src/frontend/package.json`)
2. Publish directory: `build`
3. Rewrite rule: `/*` -> `/index.html` (so client-side routes work)
4. Environment variable `REACT_APP_API_URL`: the backend's URL plus `/api`,
   e.g. `https://peer-evaluation-backend-rd6z.onrender.com/api`. It is baked
   in at build time, so re-deploy the site after changing it.
5. Then set the backend's `FRONTEND_URL` to the static site's URL.

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