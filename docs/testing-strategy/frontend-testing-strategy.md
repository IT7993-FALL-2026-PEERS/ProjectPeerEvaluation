# Frontend Automated Testing Strategy (M4)

Status: **draft for team review** — part of Milestone 1 (Assessment & Planning, review 28 Sep).
Owner: Khoa Ho (M4) — scope per `PEERS_CICD_Pipeline_Plan_Revised.docx`: *"Frontend unit & integration
tests, end-to-end student workflow, automated test reporting."*

Backend unit/integration testing is out of scope for this document — that's M5 (Kylee Gipson)'s
deliverable. This strategy only covers `src/frontend`.

## 1. Current state

- Tooling already present via Create React App: Jest + `@testing-library/react` +
  `@testing-library/user-event` (in `package.json`, previously unused — no `src/setupTests.js`
  existed, so `jest-dom` matchers weren't even wired up).
- First unit tests landed in [PR #1](../../pull/1): `AuthContext` (login/logout + localStorage
  persistence), the `login` service (axios call shape), and `ProtectedRoute` (currently a
  passthrough component — see open question 1).
- No integration or end-to-end tests exist yet. No E2E tool (Cypress/Playwright) is installed.

## 2. Unit testing

Continue with Jest + React Testing Library, colocated in `__tests__` folders next to the source
file they cover (matches the convention started in PR #1). Prioritized by size/risk, not yet covered:

| File | Lines | Notes |
|---|---|---|
| `pages/StudentEvaluation.js` | 373 | Public, unauthenticated — the page students actually use. High priority. |
| `pages/LoginPage.js` | 212 | Professor auth entry point. |
| `pages/Reports.js` | 737 | Score aggregation/display logic worth isolating from rendering. |
| `pages/CourseManagement.js` | 2,687 | Largest file in the app; needs to be broken into smaller testable units first (see open question 2). |
| `pages/Settings.js` | 131 | |
| `pages/ResetPassword.js` | 71 | |
| `services/api.js` | — | Axios instance + interceptors; currently untested. |
| `pages/Dashboard.js`, `pages/TeamAssignment.js` | 6 each | Stubs — not yet implemented, nothing to test until they are. |

## 3. Integration testing

Frontend-only integration tests (page/component + real routing + mocked network boundary), not
to be confused with M5's frontend↔backend↔DB integration tests. Approach:

- Mock the network boundary with **MSW (Mock Service Worker)** rather than mocking `axios`
  per-test — MSW intercepts at the HTTP layer, so components exercise their real request/response
  handling code instead of a hand-mocked shortcut. Not yet a dependency; needs to be added.
- Cover full page flows: e.g. `StudentEvaluation` — token in URL → form loads with the rubric →
  user rates teammates and submits → success state renders (mirrors backend's
  `evaluationController.submitEvaluation` validation, so the two suites should catch the same
  contract from both ends).
- Cover `react-router-dom` navigation between pages that depend on `AuthContext` state
  (`ProtectedRoute` behavior once it has real logic — see open question 1).

## 4. End-to-end testing (student workflow)

Scope per the revised plan: *"student workflow (receive invitation → open link → complete
evaluation → submit → verify)"* — matches user stories US-S1/US-S2 in
`docs/requirements/user-stories.md`.

- **Tool recommendation: Playwright.** Both Playwright and Cypress fit; leaning Playwright for
  built-in multi-browser support (US-S1's "mobile-responsive design" acceptance criterion is
  easier to check with Playwright's device emulation) and because it doesn't require a separate
  paid dashboard for CI artifact retention. Open to Cypress if the team prefers its DX — flagging
  as a decision, not a unilateral pick.
- Scenario: seed a test evaluation token directly against a test DB (or via API) → navigate to
  `/evaluate/:token` → verify the rubric renders per `config/rubric.js` → rate each teammate →
  submit → assert the confirmation state → assert re-visiting the same link shows "already
  completed" (covers `evaluationController.submitEvaluation`'s `ALREADY_COMPLETED` path).
- Runs against a real (ephemeral) backend + DB, so it depends on M2's containerization /
  M5's backend test-data setup being available — this can't be built fully standalone.

## 5. Automated test reporting

- Unit/integration: Jest's built-in `--coverage` + a JUnit XML reporter (e.g.
  `jest-junit`) so CI can surface pass/fail and coverage trend, not just a pass/fail boolean.
- E2E: Playwright's built-in HTML report, published as a CI artifact.
- Both need to plug into M1 (Donald)'s CI pipeline as a reporting step — coordinate on where
  artifacts get published (PR comment vs. Actions summary vs. dashboard).

## 6. Requirements traceability (frontend slice)

Contribution to the team RTM — maps functional requirements to planned frontend tests:

| Requirement | Planned test |
|---|---|
| FR3.1–FR3.2 (evaluation form generation, email link) | E2E: student workflow scenario (§4) |
| FR4.1–FR4.2 (ratings 1–5, feedback 50–500 chars) | Integration: `StudentEvaluation` form validation |
| FR4.4 (prevent duplicate submissions) | E2E: re-visit-after-submit scenario (§4) |
| FR5.1–FR5.2 (aggregated reports, average scores) | Unit: `Reports.js` calculation logic |
| FR1.1, FR1.4 (professor login, session timeout) | Unit/integration: `LoginPage`, `AuthContext` |

## Open questions for the team

1. `ProtectedRoute` (`src/frontend/components/ProtectedRoute.js`) is currently a passthrough with
   a `// Add your authentication logic here` comment — no real route protection exists yet. Who
   implements the actual guard logic, and when? Tests can't meaningfully cover it until then.
2. `CourseManagement.js` is 2,687 lines in one file. Worth splitting into smaller components before
   writing unit tests against it, or accept large-component testing for now?
3. Cypress vs. Playwright — final call before Milestone 2 work starts (05 Oct).
4. MSW as a new dependency for integration tests — any objection before it's added?
