# Deployment guide (replaced)

This file used to hold the original deployment notes: build and start commands for a Render dashboard
setup and some alternative hosting options. They no longer describe how PEERS is deployed, so the text
was removed. The earlier version is in the git history.

The current setup is documented here:

- `render.yaml`: the staging services on Render (the backend runs the container image that CI builds, the
  frontend is built from source with Vite).
- [`docs/cd-pipeline.md`](docs/cd-pipeline.md): how a merge to `main` reaches staging.
- [`docs/operations/render-handover.md`](docs/operations/render-handover.md): handing over the Render,
  database and mail accounts.
- [`docs/startup-and-environment.md`](docs/startup-and-environment.md) and
  [`docs/docker-setup.md`](docs/docker-setup.md): environment variables and local setup.
