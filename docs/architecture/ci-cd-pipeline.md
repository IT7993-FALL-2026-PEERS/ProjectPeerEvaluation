# CI/CD Pipeline

This is the actual, running pipeline on the `with-test-coverage` branch (see
`.github/workflows/` and `render.yaml`), not an aspirational sketch --
every path shown here has been executed and verified end to end.

Push to `with-test-coverage` runs the backend and frontend's own tests
independently. Passing tests deploy that app to staging automatically. The
moment staging is confirmed live, that same pipeline starts the production
pipeline for that app -- which runs the tests again and then stops, waiting
for a human to click Approve, before it deploys anything to production.
Nothing reaches production without both a passing test run and a deliberate
approval; nothing requires a human to manually run or trigger anything
except that one click.

| | Staging | Production |
|---|---|---|
| **Backend** | [peer-evaluation-backend-staging.onrender.com](https://peer-evaluation-backend-staging.onrender.com) | [peer-evaluation-backend-production.onrender.com](https://peer-evaluation-backend-production.onrender.com) |
| **Frontend** | [peer-evaluation-frontend-staging.onrender.com](https://peer-evaluation-frontend-staging.onrender.com) | [peer-evaluation-frontend-production.onrender.com](https://peer-evaluation-frontend-production.onrender.com) |

```mermaid
flowchart TB
    DEV(["Developer pushes<br/>to with-test-coverage"])

    subgraph BE_STAGING["backend-ci-cd.yml -- automatic on every push"]
        direction TB
        BE_UNIT["unit-tests<br/>mocked, no network"]
        BE_INTEG["integration-tests<br/>real Express app + real MongoDB<br/>(ephemeral container)"]
        BE_DEPLOY["deploy<br/>1. POST Render deploy hook<br/>2. poll /api/health for the new commit<br/>3. gh workflow run deploy-production.yml"]
        BE_UNIT --> BE_INTEG --> BE_DEPLOY
    end

    subgraph FE_STAGING["frontend-ci-cd.yml -- automatic on every push"]
        direction TB
        FE_UNIT["unit-tests<br/>React Testing Library, network mocked"]
        FE_INTEG["integration-tests<br/>real App + router + AuthContext"]
        FE_DEPLOY["deploy<br/>1. POST Render deploy hook<br/>2. poll /version.txt for the new commit<br/>3. gh workflow run deploy-production.yml"]
        FE_UNIT --> FE_INTEG --> FE_DEPLOY
    end

    DEV --> BE_UNIT
    DEV --> FE_UNIT

    BE_DEPLOY --> BE_STG_SVC[("Render: peer-evaluation-<br/>backend-staging<br/>peer-evaluation-backend-staging.onrender.com")]
    FE_DEPLOY --> FE_STG_SVC[("Render: peer-evaluation-<br/>frontend-staging<br/>peer-evaluation-frontend-staging.onrender.com")]

    subgraph FALLBACK["Manual fallbacks -- re-promote without a new push"]
        direction TB
        TAG["scripts/deploy-to-production.sh<br/>pushes a deploy-*-production-* tag"]
        BUTTON["Actions tab 'Run workflow'<br/>or gh workflow run"]
    end

    subgraph PROD["deploy-production.yml -- one workflow, backend and frontend promote independently"]
        direction TB

        subgraph PBE["backend path"]
            direction TB
            PBE_UNIT["backend-unit-tests"]
            PBE_INTEG["backend-integration-tests"]
            PBE_UNIT --> PBE_INTEG
        end

        subgraph PFE["frontend path"]
            direction TB
            PFE_UNIT["frontend-unit-tests"]
            PFE_INTEG["frontend-integration-tests"]
            PFE_UNIT --> PFE_INTEG
        end

        GATE_BE{{"production-backend environment<br/>required reviewer: dgobin-ksu<br/>run shows 'Waiting'"}}
        GATE_FE{{"production-frontend environment<br/>required reviewer: dgobin-ksu<br/>run shows 'Waiting'"}}

        PBE_INTEG --> GATE_BE
        PFE_INTEG --> GATE_FE

        DEPLOY_BE["deploy-backend<br/>1. POST Render deploy hook<br/>2. poll /api/health for the new commit"]
        DEPLOY_FE["deploy-frontend<br/>1. POST Render deploy hook<br/>2. poll /version.txt for the new commit"]

        GATE_BE -- "Approve" --> DEPLOY_BE
        GATE_FE -- "Approve" --> DEPLOY_FE
    end

    BE_DEPLOY -- "workflow_dispatch API call<br/>deploy_backend=true" --> PBE_UNIT
    FE_DEPLOY -- "workflow_dispatch API call<br/>deploy_frontend=true" --> PFE_UNIT
    TAG --> PBE_UNIT
    TAG --> PFE_UNIT
    BUTTON --> PBE_UNIT
    BUTTON --> PFE_UNIT

    DEPLOY_BE --> BE_PROD_SVC[("Render: peer-evaluation-<br/>backend-production<br/>peer-evaluation-backend-production.onrender.com")]
    DEPLOY_FE --> FE_PROD_SVC[("Render: peer-evaluation-<br/>frontend-production<br/>peer-evaluation-frontend-production.onrender.com")]

    classDef auto fill:#dcfce7,stroke:#15803d,color:#14532d,stroke-width:2px
    classDef gate fill:#fef3c7,stroke:#d97706,color:#78350f,stroke-width:3px
    classDef service fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px
    classDef endpoint fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:3px
    classDef fallback fill:#f1f5f9,stroke:#475569,color:#334155,stroke-width:2px,stroke-dasharray: 6 4
    linkStyle default stroke-width:2px

    class BE_UNIT,BE_INTEG,BE_DEPLOY,FE_UNIT,FE_INTEG,FE_DEPLOY,PBE_UNIT,PBE_INTEG,PFE_UNIT,PFE_INTEG,DEPLOY_BE,DEPLOY_FE auto
    class GATE_BE,GATE_FE gate
    class BE_STG_SVC,FE_STG_SVC,BE_PROD_SVC,FE_PROD_SVC service
    class DEV endpoint
    class TAG,BUTTON fallback

    click BE_STG_SVC "https://peer-evaluation-backend-staging.onrender.com" "Open peer-evaluation-backend-staging" _blank
    click FE_STG_SVC "https://peer-evaluation-frontend-staging.onrender.com" "Open peer-evaluation-frontend-staging" _blank
    click BE_PROD_SVC "https://peer-evaluation-backend-production.onrender.com" "Open peer-evaluation-backend-production" _blank
    click FE_PROD_SVC "https://peer-evaluation-frontend-production.onrender.com" "Open peer-evaluation-frontend-production" _blank
```

## Why it's shaped this way

- **Backend and frontend are fully independent pipelines**, from the first
  push all the way to production. A backend-only change never runs frontend
  tests or touches the frontend's production environment, and vice versa.
  This is also why `deploy-production.yml` is one workflow file with two
  parallel job chains, not two files: it lets a single push start either or
  both chains without duplicating the approval-gate logic.

- **`main` and `with-test-coverage` are deliberately kept separate** (`main`
  has its own, independently evolving CI/test setup). That ruled out the
  more obvious way to auto-chain workflows -- the `workflow_run` event --
  since GitHub only fires it for a listening workflow that exists on the
  repository's *default* branch, no exceptions. Instead, the staging
  `deploy` job calls `deploy-production.yml` itself via the workflow
  dispatch API (`gh workflow run`), which has no such restriction once a
  workflow is registered (i.e. has run at least once, via any trigger).

- **The approval gate is a GitHub Environment protection rule**, not custom
  workflow logic: `deploy-backend`/`deploy-frontend` simply declare
  `environment: production-backend` / `production-frontend`, and GitHub
  itself pauses the job and shows "Waiting" until the environment's
  required reviewer approves it in the Actions tab. Nothing reaches
  production on tests passing alone.

- **Render's own git-push auto-deploy is off on all four services.** Every
  deploy is a Render Deploy Hook call from one of these jobs, pinned to the
  exact commit that was just tested (`?ref=<sha>`) -- never whatever Render
  would otherwise build from a service's configured branch by default.

- **A static site can't report its own commit like a running server can**,
  so the frontend deploys write `RENDER_GIT_COMMIT` to `public/version.txt`
  at build time (see `render.yaml`); the backend's `/api/health` already
  exposes the same thing directly from its running process (see
  `src/backend/index.js`). Both `deploy` jobs poll their app's version
  endpoint after triggering a deploy, so "deploy succeeded" always means
  the new commit is actually the one serving traffic, not just that Render
  accepted the trigger.

See `.github/workflows/backend-ci-cd.yml`, `frontend-ci-cd.yml`, and
`deploy-production.yml` for the full, current source of truth -- their
header comments cover each of these points in more depth, plus the exact
history of what didn't work (`workflow_run`, and why `gh workflow run`
initially failed without `--repo`) before landing here.
