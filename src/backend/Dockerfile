# Builds the backend API as deployed to Render (see render.yaml at the repo
# root, and DEPLOYMENT_GUIDE.md). Build context is this directory
# (src/backend), not the repo root -- render.yaml's dockerContext and the
# `docker build` commands in DEPLOYMENT_GUIDE.md/docker-compose.yml both
# point here so the COPY paths below resolve correctly.
FROM node:20-alpine

WORKDIR /app

# Copying just the manifest files first lets Docker cache this layer and
# skip `npm ci` on rebuilds where only application code changed, not
# dependencies.
COPY package*.json ./
# --omit=dev: jest/supertest (this project's only devDependencies) aren't
# needed to run the server, so leaving them out keeps the image smaller.
# Tests run in CI (.github/workflows/ci-cd.yml) before this image is ever
# built, not inside the container.
RUN npm ci --omit=dev

# .dockerignore excludes node_modules, .env, tests, coverage, scripts, and
# migrations from this -- see that file for the full list and why.
COPY . .

ENV NODE_ENV=production
# Informational only -- Render ignores EXPOSE and injects its own PORT env
# var at runtime (default 10000), which index.js already reads via
# `process.env.PORT || 5000`. 5000 here just matches the historical default
# for running this image directly with `docker run` outside Render.
EXPOSE 5000

CMD ["node", "index.js"]
