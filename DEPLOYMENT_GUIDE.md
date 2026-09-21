# Peer Evaluation System - Deployment Guide

## Option 1: Render.com (Free tier available)

### Backend Deployment:
1. Create account at render.com
2. Connect your GitHub repository
3. Create a new "Web Service"
4. Set build command: `cd src/backend && npm install`
5. Set start command: `cd src/backend && node index.js`
6. Add environment variables:
   - `MONGODB_URI`: Your MongoDB connection string
   - `JWT_SECRET`: A long random string (at least 32 characters) used to sign login tokens
   - `SMTP_HOST`: Your email server (e.g., smtp.gmail.com)
   - `SMTP_PORT`: 587
   - `SMTP_USER`: Your email address
   - `SMTP_PASS`: Your email password/app password
   - `SMTP_FROM`: Your sender email
   - `FRONTEND_URL`: Your frontend URL (after frontend deployment)

### Frontend Deployment:
1. Create another "Static Site" on Render
2. Set build command: `cd src/frontend && npm install && npm run build`
3. Set publish directory: `src/frontend/build`

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

## Option 4: Docker + Cloud Provider

### Create Dockerfile for backend:
```dockerfile
FROM node:24
WORKDIR /app
COPY src/backend/package*.json ./
RUN npm install
COPY src/backend .
EXPOSE 5000
CMD ["node", "index.js"]
```

### Deploy to:
- Google Cloud Run
- AWS ECS
- DigitalOcean App Platform

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