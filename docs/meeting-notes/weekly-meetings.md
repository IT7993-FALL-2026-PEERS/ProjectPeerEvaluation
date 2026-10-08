# Weekly Meetings

Decisions and outcomes from sponsor meetings. Earlier weekly updates are in the team's weekly log documents.

## 5 October 2026 — team decisions for Milestone 2

Two decisions the team owed by 5 October, recorded here on 8 October with the reasons.

### How MongoDB runs in CI (backlog CICD-15)

- **Decision:** the backend integration tests start their own MongoDB with `mongodb-memory-server`, in replica-set mode. The same setup runs on the team's laptops and in GitHub Actions, so no Docker and no service container is needed.
- **Why:** one setup for local and CI runs, so a teammate can run the tests with `npm` alone, even with Docker Desktop off. A replica set supports transactions, as the Atlas staging cluster does, and the all-or-nothing evaluation submission uses one (CICD-33). Every run starts from a fresh database.
- **Version:** pinned to MongoDB 8.0.32, the version of the Atlas staging cluster. Re-check it at each milestone review.
- **Rejected:** a shared Atlas test database (shared state, a secret that fork and Dependabot pull requests cannot read, M0 rate limits).
- **Fallback:** a `docker run mongo --replSet` step in CI, if downloading the binary ever proves flaky. The tests would not change, but the integration helper (`integration/helpers/db.js`) would need a small change to connect to an external MongoDB instead of starting its own.
- **Where it stands:** the `Integration (real MongoDB)` job (133 tests, including the transaction path) is a required check and runs on every pull request, with the MongoDB binary cached between runs.
- **Decided by:** Khoa Ho (M4) approved on 2 October; Kylee Gipson (M5) supports it (relayed by Khoa, to be confirmed by Kylee).

### What Docker is for (backlog CICD-16)

- **Decision:** option C, images are built, pushed and verified, and Render still builds from source. The delivery pipeline builds both images, tags them with the commit SHA, pushes them to GitHub Container Registry and smoke-tests them; Render deploys the same commit from source. Images are never tagged `latest`.
- **Why:** it meets the sponsor's "build Docker images" step without recreating the staging services or adding Render cost, and it makes the release candidate a real artifact: an image pair already proven to start and answer `/api/health`.
- **The honest cost:** Render builds its own copy of the commit, so "the tested image is the deployed image" is not literally true. The smoke tests against staging after each deploy narrow that gap but do not close it: they check the login page, health, CORS and the app's API address, not a full workflow.
- **Later, only if time remains:** make the images the delivery artifact (Render runs the registry image). Revisit at the 26 October review, not at the last minute.
- **Where it stands:** the `Containers (build + compose smoke)` check builds both images and starts the stack on every pull request. Since 7 October the delivery pipeline runs on every merge to `main`: it builds both images, health-checks them and pushes them to GitHub Container Registry tagged with the commit SHA, deploys staging, runs the smoke tests, and tags an `rc-*` release candidate only when everything passed.
- **Decided by:** Khoa Ho (M4) approved on 2 October; Aaron Simpson (M2) supports it (relayed by Khoa, to be confirmed by Aaron).

## 28 September 2026 — Milestone 1 review

- **Attendees:** Dr. Geetika Vyas (sponsor) and the whole team: Khoa Ho (Team Leader, M4), Donald Gobin (M1), Aaron Simpson (M2), Laeticia Neno Aloyem (M3), Kylee Gipson (M5).
- **Outcome:** the sponsor signed off on all nine Milestone 1 deliverables: architecture review, technical assessment report, requirements validation, critical workflows, Requirements Traceability Matrix, development environment validation, containerization assessment, CI/CD architecture design and automated testing strategy.
- **Still open:** the sponsor questions in `docs/requirements/requirements.md` (for example open professor registration, deadline enforcement, and what a roster re-upload should do to existing evaluations). They were not decided at this meeting.
- **Next:** close Milestone 1 by 30 September (record the sign-off here and in `requirements.md`; share the final documents with the sponsor and instructor), then start Milestone 2 on 5 October. Team decisions due by 5 October: how MongoDB runs in CI, what Docker is for, and how the testing work is split.
- **Evidence:** `docs/milestones/milestone-1/PEERS_Milestone1_Formal_Report.md` (reference [15]).

## 25 September 2026 — sponsor update

- **Outcome:** the sponsor approved the CI/CD pipeline design in the README ("Based on current design I would consider this approved to proceed") and approved the critical workflows CW-01 to CW-12.
- **Evidence:** `docs/requirements/critical-workflows.md`, README CI/CD Pipeline section.
