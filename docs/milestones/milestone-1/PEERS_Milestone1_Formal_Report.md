# PEERS Milestone 1 Progress Report

Assessment and Planning

CI/CD Pipeline for the PEERS Peer Evaluation System
Kennesaw State University, College of Computing and Software Engineering

Milestone: 1, Assessment and Planning
Reporting period: 14 September to 28 September 2026
Milestone window: 14 September to 30 September 2026
Submission date: 28 September 2026 (milestone review)

Team 1: Khoa Ho (Team Leader, M4), Donald Gobin (M1), Aaron Simpson (M2), Laeticia Neno Aloyem (M3), Kylee Gipson (M5)
Sponsor: Dr. Geetika Vyas | Advisor: Dr. Ying Xie
Prepared by: Team 1 (Khoa Ho)

## 1. Executive summary

The team has established a documented technical baseline for the inherited PEERS application and implemented an initial automated quality pipeline. Architecture, API, technology-stack, database, deployment, containerization and repository assessments are complete. The sponsor approved the CI/CD design and the critical workflows on 25 September. **All nine Milestone 1 deliverables are complete**, each with a merged pull request as evidence, and the sponsor signed off on all of them at the 28 September milestone review, attended by the full team. Milestone 1 closes on 30 September as planned. [12, 14, 15]

As of main commit 1aa6678 on 28 September, CI and the security scan pass on main. The backend suite has 140 passing tests and the frontend 30, all unit-level and all run in CI. Every change to main needs a pull request, four passing required checks and an up-to-date branch, with no bypass. The staging environment on Render reported healthy with its database connected (28 September, 22:15 UTC). The backend dependency audit reports no vulnerabilities; the frontend reports 29, none critical, all in Create React App build tooling. CodeQL code scanning, enabled on 27 September, raised 92 backend alerts on its first scan, most of them the missing rate limiting already logged; they will be triaged in Milestone 2. [2, 3, 4, 11, 13]

These are early Quality Automation achievements. Early implementation work, including CI, the staging environment and defect fixes, is reported as progress toward Milestones 2 and 3, not as a substitute for the Milestone 1 planning deliverables.

## 2. Milestone objectives and sponsor requirements

The sponsor's project is the modernization of an existing system, with emphasis on reliability, automated testing, containerization and CI/CD rather than significant new business features. Milestone 1, Assessment and Planning, requires nine deliverables [1, p. 13]:

- Application architecture review
- Technical assessment report
- Requirements validation
- Critical workflow identification
- Requirements Traceability Matrix
- Development environment validation
- Containerization assessment
- CI/CD architecture design
- Automated testing strategy

Sponsor requirements that shape this milestone:

| Requirement | Source | How it is addressed |
| --- | --- | --- |
| Review assessment findings with the sponsor before implementation begins | [1, p. 4] | Findings were reviewed with the sponsor, and signed off, at the 28 September meeting. Work before it was limited to defect corrections and CI from the approved design (see below). |
| Link each validated business requirement to one or more automated tests | [1, pp. 4, 9] | The RTM maps all 26 rows to existing tests or to planned Milestone 2 tests. |
| Keep production deployment a manual approval step; production hosting is not required | [1, pp. 9, 12] | The approved design ends in a manual sponsor approval gate; only a staging environment exists. |
| Do not redesign the UI, replace the stack, rewrite the application or migrate the database | [1, p. 12] | No stack changes; a Create React App replacement is recorded only as future work. |
| Correct defects identified during testing | [1, p. 11] | Fourteen defect fixes merged, each with an automated test (section 4). |

The specification asks for findings to be reviewed before implementation begins. Work completed before the 28 September review is limited to defect corrections, which the specification also asks for, and the CI pipeline built from the design the sponsor approved on 25 September [12]. No new application features were added.

## 3. Deliverable status and supporting evidence

Status of each sponsor deliverable on main at 1aa6678. Assigned responsibility is separate from authorship (section 6).

| Sponsor deliverable | Status at 28 September | Evidence |
| --- | --- | --- |
| Architecture review | Complete | Architecture, API and stack documents (#52); repository audit (#58). |
| Technical assessment report | Complete | Final: 23 defects logged, all sections closed, corrections merged (#63, #68). Findings reviewed and signed off by the sponsor on 28 September. [15] |
| Requirements validation | Complete | 23 functional requirements with acceptance criteria, final (#18, #63, #68); signed off by the sponsor on 28 September. [15] |
| Critical workflows | Complete; sponsor-approved | CW-01 to CW-12, each traced to code (#26); approved by the sponsor on 25 September. [12] |
| Requirements Traceability Matrix | Complete | All 26 rows map to existing automated tests or to a planned test level and Milestone 2 week; no open entries (#68). |
| Development environment validation | Complete | Review (#56) and a recorded clean-clone run on 27 September: install 59 s, MongoDB in Docker 37 s, both servers up in 14 s (#68). |
| Containerization assessment | Complete | Assessment (#3) and recommendations (#56). Whether Docker is also the delivery artifact is decided at the Milestone 2 kickoff. |
| CI/CD architecture design | Complete; sponsor-approved | README diagrams and governance documents (#59 to #64); approved by the sponsor on 25 September. [12] |
| Automated testing strategy | Complete | Final, with its four decisions recorded (#66, #68). |

Source basis: sponsor milestone list [1, p. 13], repository documents [2, 5], and merged PRs #56, #63, #66 and #68 [6-8, 14].

## 4. Completed work and validation results

### 4.1 Technical baseline

PEERS is a three-tier web application: a React 19 single-page app, an Express 4 REST API with 47 endpoints, MongoDB with six collections, and SMTP email. Professors authenticate with signed tokens; students reach their evaluation through an individual link. When the team started on 14 September there were no automated tests, no CI or CD, manual deployment, a Docker Compose file for a database the application does not use and no Dockerfiles, a committed environment file, and five empty placeholder documents. [2, 5]

### 4.2 Pipeline and test evidence

| Area | Verified progress | Remaining limitation |
| --- | --- | --- |
| Continuous integration | Four required jobs: frontend test and build, backend syntax and tests, Playwright, and workflow lint. Latest main CI succeeded. | Backend linting, coverage reporting and integration and regression gates remain. |
| Backend tests | 140 passing tests with Node's test runner, including model stubs and route-level authorization checks on every course route. | Passing tests do not yet cover every requirement or a real database. |
| Frontend and browser tests | 30 frontend tests run in CI on every pull request; the Playwright job runs in CI. | The browser test validates setup, not the instructor and student workflows. |
| Security | OWASP dependency scan passes; CodeQL scans every pull request; secret scanning and push protection are on. Dependabot raises alerts and, since 28 September, opens weekly update pull requests (first batch: 10). Backend audit: 0 vulnerabilities; frontend: 29, none critical (down from 64 with 2 critical). SMTP certificate checking restored; Nodemailer upgraded. | CodeQL's first scan raised 92 backend alerts (77 missing rate limiting, 11 queries built from request data, 4 file paths from user input), not yet triaged. The remaining frontend advisories are pinned by Create React App, so Dependabot cannot update them. Triage, accepted risks and blocking thresholds remain. |
| Staging delivery | Render deploys main after the required checks pass and switches traffic only when /api/health reports the database connected. Verified end to end on 25 September; health re-checked on 28 September. [13] | Docker image delivery, post-deploy smoke tests and release candidates are Milestone 3 work. |
| Development environment | A clean clone following the README ran end to end on 27 September with MongoDB 7 in Docker. | MongoDB is not yet in the README prerequisites. |

### 4.3 Corrective work

Merged fixes address course ownership and owner-field updates (#50), CSV field escaping and formula protection (#45), empty team averages (#46), professor-configured feedback words (#47), SMTP certificate verification and Nodemailer (#49), and partial evaluation writes on validation failure (#27). Frontend work corrected personalized-link routing (#32), misleading email-result messages (#33, #34), and logged-out access and session cleanup (#37). These changes preserve or repair existing functionality, in line with the sponsor's defect-correction objective. [9]

The pipeline goes beyond the assessment baseline, but the sponsor also requires database and email integration tests, critical-workflow regression tests, representative end-to-end journeys and release smoke testing. Those remain Milestone 2 and 3 work.

## 5. Open defects, risks and limitations

| Risk or decision | Effect | Recommended action |
| --- | --- | --- |
| Evaluation integrity | Submissions may include self, non-teammate or duplicate ratings. | Validate the intended behavior with the sponsor; prioritize authorization and regression tests. |
| Student links | Weak, non-expiring links protect confidential evaluation access. | Agree token strength, expiry and reissue behavior before changing the workflow. |
| Roster replacement | A re-upload can remove existing evaluations. | Decide whether submitted work must be preserved; add a regression case. |
| Deadline handling (D-23) | The evaluation deadline appears only in the invitation email; it is not stored or enforced. | Decide whether deadlines are enforced; classify the behavior in the requirements and RTM. |
| Incomplete advertised behavior | MFA is unfinished; rubric, AI and PDF-export scope need clarification. | Classify supported, deferred and excluded functionality in the requirements and RTM. |
| Repeatable environment | MongoDB is not in the README prerequisites and Dockerfiles are absent. | Add MongoDB to the setup steps; agree Docker use for development and delivery. |
| Security and configuration | Tracked configuration, known seed credentials, 92 untriaged CodeQL alerts and frontend tooling advisories remain. | Triage findings, check staging accounts, and record owners and accepted risks. |
| Test depth | Eight RTM rows rely on planned tests, and coverage is not yet measured. | Build the planned Milestone 2 tests and measure the coverage baseline. |
| Email constraints | SMTP throttling and synchronous sending limit larger test scenarios. | Use isolated email tests; agree a capacity and queueing approach within scope. |
| Possible production services | Deploy-hook secrets exist for an unmerged branch whose commit states production services were created (audit A-05). | M1 and M2 confirm what exists in Render and remove what is unused. |

**Limitations of this report.** The credential search found no real credentials in the repository; it does not establish the security of the live Render, Atlas or SMTP accounts. Vulnerability and alert counts (28 September) and coverage figures (26 September) are snapshots, not acceptance thresholds. The report uses no personal hours or completion percentages, because no timesheets or agreed weighting method are attached.

## 6. Team contributions

| Member | Role | Milestone 1 contributions |
| --- | --- | --- |
| Khoa Ho | Team Leader, M4: frontend tests and test reporting | CI workflow and quality gate (#6 and follow-ups); README CI/CD design (#10, #24, #51); Render staging (#31); critical workflows and RTM (#26, #68); architecture, API and stack documents (#52); frontend and backend tests and defect fixes (#1, #27, #32 to #50, #53); clean-clone environment run and Milestone 1 close-out (#68 to #70). 51 merged pull requests. |
| Donald Gobin | M1: CI/CD architecture and governance | Repository, dependency and workflow audit (#58); CODEOWNERS, self-merge and no-bypass governance (#59 to #61, #64); GitHub security features enabled on 27 September. 5 merged pull requests. |
| Aaron Simpson | M2: environment, containerization and delivery | Deployment review (19 September); development environment review and containerization recommendations (#56). 1 merged pull request. |
| Laeticia Neno Aloyem | M3: requirements, QA, security and documentation | Technical assessment report (#17); requirements and acceptance criteria (#18); corrections (#63); automated testing strategy (#66). 4 merged pull requests. |
| Kylee Gipson | M5: backend tests | Database architecture and dependency review (#12). 1 merged pull request. |

Of the 62 pull requests merged between 19 and 28 September, the counts above are by author; every one merged since CI was added on 20 September went through it. Attribution is based on artifacts and commits, not an estimate of effort or personal hours. Role assignments follow the approved Gantt chart.

## 7. Sponsor decisions needed

The sponsor approved CW-01 through CW-12 on 25 September and signed off on all Milestone 1 deliverables on 28 September. Decisions still open for Milestone 2:

- The supported scope of rubric management, AI-assisted feedback and PDF export.
- Decisions on open professor registration, incomplete MFA, preserving evaluations during roster re-upload, student-link expiry and reissue, and whether evaluation deadlines are enforced.
- Three inherited requirement mismatches: participation is rated 1–4 rather than 1–5, sessions last one hour rather than 30 minutes, and feedback accepts 10 characters rather than the documented 50–500. Expected behavior should be agreed before acceptance tests are written.
- Confirmation of the staging arrangement and whether Docker is also the delivery artifact. The specification excludes a commercial production environment; this does not remove containerized delivery or its manual production approval step.

Decisions and any approved scope changes will be recorded in the meeting notes and the RTM. [1, 5]

## 8. Milestone 2 plan

Milestone 2, Quality Automation, runs from 5 October to 1 November, with its review on 26 October.

| Target | Action | Responsible role |
| --- | --- | --- |
| 28 September | Milestone 1 review held; the sponsor signed off on all nine deliverables. Done. | Sponsor and team |
| By 30 September | Record the sign-off in the meeting notes and requirements.md; share the final Milestone 1 documents with the sponsor and instructor; close Milestone 1. | M3 and M4 |
| By 5 October | Agree the MongoDB integration environment, the Docker scope for development and delivery, and the split of testing work; resolve the install-script advice. | M1, M2, M4, M5 and team |
| 5 to 18 October | Build Dockerfiles and Compose; add unit and integration tests named TC-<FR>-<n>; measure the coverage baseline. | M2, M4 and M5 |
| 19 October to 1 November | Add workflow regression and end-to-end tests, security triage and gates, and stronger reporting. | M1, M3, M4 and M5 |

## 9. References and appendices

Evidence cutoff: 28 September 2026. Repository main: 1aa6678185f5bbd6947856cd7a6d09a9381d00e2. Pull request status reflects GitHub at preparation time.

[1] Productionization, Automated Testing, and CI/CD for the PEERS Peer Evaluation System-CCSE. Sponsor project specification, 15 pages. Assessment and validation: pp. 3–4; testing: pp. 5–8; CI/CD and reporting: pp. 8–10; scope: pp. 11–12; milestones: pp. 13–14.

[2] Repository baseline. https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/tree/1aa6678185f5bbd6947856cd7a6d09a9381d00e2

[3] CI run on main. https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/actions/runs/36359921845

[4] Governance and no bypass. https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/pull/64

[5] Assessment and requirements documents, under the repository baseline: docs/architecture/, docs/requirements/, docs/technical-assessment/, docs/deployment-review.md and README.md.

[6] Environment and containerization reviews (merged). https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/pull/56

[7] Assessment corrections (merged). https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/pull/63

[8] Testing strategy (merged). https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/pull/66

[9] Corrective work and authorship: pull requests #1, #6, #10, #12, #17, #18, #24, #26, #27, #31, #32–34, #37, #45–53, #56, #58–64, #66 and #68–70, each at the repository /pull/<number> URL.

[10] Security scan run on main (weekly schedule, 28 September). https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/actions/runs/36413675553

[11] CodeQL run on main (1aa6678); CodeQL also runs on every pull request. Open alerts on 28 September: 92, all in src/backend, none triaged. https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/actions/runs/36359921032

[12] Sponsor approval, Dr. Geetika Vyas, 25 September 2026: approved the CI/CD design in writing ("Based on current design I would consider this approved to proceed") and approved the critical workflows CW-01 to CW-12. Kept with the team's milestone records.

[13] Staging health check, 28 September 2026, 22:15 UTC: GET /api/health returned status OK, database connected, commit 11e6e2f (the latest backend change). The end-to-end walkthrough of 25 September is recorded in the team's staging notes.

[14] Milestone 1 close-out. https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/pull/68 (RTM mapping, testing-strategy decisions, final assessment report, clean-clone run), https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/pull/69 (approval date) and https://github.com/IT7993-FALL-2026-PEERS/ProjectPeerEvaluation/pull/70 (this report).

[15] Milestone 1 review, 28 September 2026, 5:30–6:30 PM: attended by all five team members and the sponsor, Dr. Geetika Vyas, who signed off on all nine Milestone 1 deliverables. Recorded in the team's Week 3 weekly log.

### Appendix A: Milestone 1 documents

| Deliverable | Document in the repository |
| --- | --- |
| Architecture review | docs/architecture/system-architecture.md; api-documentation.md; docs/research-report/tech-stack-analysis.md; docs/technical-assessment/repo-cicd-audit.md |
| Technical assessment report | docs/technical-assessment/technical-assessment-report.md |
| Requirements validation | docs/requirements/requirements.md |
| Critical workflows | docs/requirements/critical-workflows.md |
| Requirements Traceability Matrix | docs/requirements/rtm.md |
| Development environment validation | docs/dev-environment-review.md |
| Containerization assessment | docs/technical-assessment/containerization-and-test-coverage-review.md; docs/containerization-recommendations.md |
| CI/CD architecture design | README.md (CI/CD Pipeline section); docs/team-guide.md |
| Automated testing strategy | docs/testing-strategy/testing-strategy.md; frontend-testing-strategy.md |
| Milestone 1 progress report | docs/milestones/milestone-1/PEERS_Milestone1_Formal_Report.md |
