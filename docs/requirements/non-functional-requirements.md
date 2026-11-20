# Non-Functional Requirements

**Source.** The sponsor's project specification lists the non-functional requirements for this project. The
completed solution should preserve existing functionality, improve reliability, support repeatable deployments,
support automated validation, improve maintainability, improve developer onboarding, minimize manual deployment
effort, improve deployment consistency and establish a sustainable development workflow. The specification sets no
performance, availability or accessibility targets, and this project did not invent any: they are not claimed
here (see defect D-08 in [`requirements.md`](requirements.md)).

This page says how each requirement is met and where to see the evidence. The functional side is in
[`rtm.md`](rtm.md); the tests that cover how the system runs rather than what it does are listed there under
"Tests that cover non-functional requirements".

| Requirement | How it is met | Evidence |
|---|---|---|
| Preserve existing functionality | No redesign, stack replacement or database change. The twelve critical workflows (CW-01 to CW-12) each have automated tests, and CI runs them on every pull request. | [`critical-workflows.md`](critical-workflows.md); [`rtm.md`](rtm.md) |
| Improve software reliability | Tests on four levels (unit, integration on a real MongoDB, end-to-end in a browser, smoke tests on staging). A submission is atomic and cannot be made twice. The backend reports its database state and commit at `/api/health`. After a failed deploy or smoke test the pipeline attempts a rollback, when a usable earlier release exists. | [Testing strategy](../testing-strategy/testing-strategy.md); [CD pipeline](../cd-pipeline.md); [Rollback and recovery](../operations/rollback-and-recovery.md) |
| Support repeatable deployments | Every merge to `main` goes through the same pipeline: build, scan, deploy to staging, smoke test, tag a release candidate. The backend runs the Docker image that CI built and tested, deployed by its digest. | [CD pipeline](../cd-pipeline.md); [Release procedure](../operations/release-procedure.md) |
| Support automated validation | Eight required checks on every pull request (frontend, backend, integration, end-to-end, containers, CodeQL, OWASP dependency scan, workflow lint), a minimum coverage level that only goes up, and a weekly regression run against staging. | [CI/CD operations](../operations/ci-cd-operations.md); `coverage-floors.json` |
| Improve maintainability | ESLint on the frontend and the backend, tested components instead of one large page, coverage floors, and documents that say how things work and why. | [README](../../README.md); [Testing strategy](../testing-strategy/testing-strategy.md) |
| Improve developer onboarding | `npm run setup`, `npm run dev` and `npm run verify` start and check the app; Docker Compose starts the whole stack. A teammate who did not build the pipeline ran the runbook on Nov 16. | [README, Getting Started](../../README.md#getting-started-for-new-users); [Runbook walkthrough](../operations/runbook-walkthrough.md) |
| Minimize manual deployment effort | A merge to `main` deploys both services to staging with no manual step. The only manual step is the production approval; no production server is run (out of scope). | [CD pipeline](../cd-pipeline.md); [Release procedure](../operations/release-procedure.md) |
| Improve deployment consistency | Release candidates record both commits and the image digest; a rollback returns to a recorded release. The same Dockerfiles and Compose file are built in CI and used locally. | [Release procedure](../operations/release-procedure.md); [Docker setup](../docker-setup.md) |
| Establish a sustainable development workflow | Pull requests with a template, a protected `main` branch with no bypass, weekly dependency updates, security scanning (dependency scan, CodeQL, secret scanning, image scan), and an accepted-risk register with expiry dates. | [Team guide](../team-guide.md); [Security policy](../security/security-policy.md) |
