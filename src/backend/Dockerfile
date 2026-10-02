# syntax=docker/dockerfile:1
# Backend image: Express + Mongoose. Build context is src/backend/.
#   docker build -t peers-backend:local src/backend
# Keep the Node major in sync with .nvmrc, package.json "engines" and render.yaml.
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependency layer first: cached until package*.json changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Application code (see .dockerignore for what is excluded).
COPY . .

# routes/courses.js uses multer({ dest: 'uploads/' }), relative to the working
# directory. The non-root user must be able to write there.
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
USER node

EXPOSE 5000

# Same check Compose uses; busybox wget exists in alpine, curl does not.
# 503 (DB down) makes wget exit non-zero, so this is a real dependency check.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/health >/dev/null || exit 1

CMD ["node", "index.js"]
