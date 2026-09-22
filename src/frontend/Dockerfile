# Builds the React frontend into static files and serves them with nginx.
# Build context is this directory (src/frontend), matching src/backend/
# Dockerfile's convention -- docker-compose.yml's frontend service sets
# `context: ./src/frontend`. Production hosting on Render does not use this
# file -- it builds the same app as a native static site (see render.yaml);
# this image is for running the frontend as a container locally via
# docker compose.
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

# .dockerignore excludes node_modules, build, coverage and tests from this.
COPY . .

# REACT_APP_* values are baked into the JS bundle by react-scripts at build
# time (see src/config.js), so they're build args here, not runtime env
# vars. The defaults point the browser at the backend published on the
# host's port 5000 by docker-compose.yml -- the browser, not the frontend
# container, makes API calls, so this is localhost rather than a Compose
# service name.
ARG REACT_APP_API_URL=http://localhost:5000/api
ARG REACT_APP_FRONTEND_URL=http://localhost:3000
ENV REACT_APP_API_URL=$REACT_APP_API_URL \
    REACT_APP_FRONTEND_URL=$REACT_APP_FRONTEND_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
