# Requirements Traceability Matrix

**Status:** Draft — seeded from `docs/requirements/requirements.md` (FR-01..FR-23) and
`docs/requirements/critical-workflows.md` (CW-01..CW-10). Test case IDs are not yet
available; they land in Milestone 2 as M4/M5 write tests. Sponsor validation of workflow
priority (see `critical-workflows.md`) is still pending Donald's sponsor session.

Column structure as specified in `requirements.md`'s "Next step" section:

| Business requirement ID | Functional requirement ID | Workflow | Test case ID | Test type | Status |
|---|---|---|---|---|---|
| FR1.1 | FR-01 | CW-01 | TBD | Integration | Needs verification — sponsor must confirm university-credential vs. local-password login is intended |
| FR1.2 | FR-02 | CW-07 | TBD | Integration | Validated |
| FR1.3 | FR-03 | CW-01 | TBD | Integration | Defective (D-17) |
| FR1.4 | FR-04 | CW-01 | TBD | Unit | Defective (D-18) |
| FR2.1 | FR-05 | CW-03 | TBD | Unit + Integration | Validated |
| FR2.2 | FR-06 | CW-04 | TBD | Integration | Validated |
| FR2.3 | FR-07 | CW-04 | TBD | Unit | Validated |
| FR2.4 | FR-08 | CW-05 | TBD | Integration | Validated (see D-10 — dual-storage drift risk, needs an explicit integration test) |
| FR3.1 | FR-09 | CW-06 | TBD | Integration | Validated |
| FR3.2 | FR-10 | CW-06 | TBD | Integration / Manual | Needs verification — depends on SMTP config and `FRONTEND_URL` at deploy time |
| FR3.3 | FR-11 | CW-08 | TBD | Integration | Validated |
| FR3.4 | FR-12 | CW-08 | TBD | Integration | Defective — reminders are on-demand only, no scheduler exists |
| FR4.1 | FR-13 | CW-07 | TBD | Unit | Defective (D-19) — participation capped at 1-4, other criteria at 1-5 |
| FR4.2 | FR-14 | CW-07 | TBD | Unit | **Defective** *(corrected from "Needs verification")* — code enforces a 10-char minimum and no maximum (`evaluationController.js:471`), against a spec of 50-500 |
| FR4.3 | FR-15 | CW-07 | TBD | Unit | **Validated** *(corrected from "Needs verification")* — `Evaluation.submitted_at` exists (`models/Evaluation.js:16`) |
| FR4.4 | FR-16 | CW-07 | TBD | Integration | **Validated** *(corrected from "Needs verification")* — duplicate-submission guard exists (`evaluationController.js:436-446`) |
| FR5.1 | FR-17 | CW-09 | TBD | Integration | Validated |
| FR5.2 | FR-18 | CW-09 | TBD | Unit | Validated |
| FR5.3 | FR-19 | CW-09 | TBD | Integration | **Partial** *(corrected from "Unsupported")* — CSV export works (`reportController.js:338-397`, D-20 is wrong on this point); PDF export is still missing |
| FR5.4 | FR-20 | CW-09 | TBD | Integration | Needs verification — statistic is computed, whether it's surfaced in the frontend view is unconfirmed |
| FR6.1 | FR-21 | CW-10 | TBD | — | Unsupported |
| FR6.2 | FR-22 | CW-10 | TBD | Unit | Validated |
| FR6.3 | FR-23 | CW-10 | TBD | — | Unsupported |
| *(none — implementation only, not in the inherited FR list)* | — | CW-02 (Password Reset) | TBD | Integration | Validated |

## Corrections to `requirements.md` found while building this matrix

Four rows above disagree with the status currently recorded in `requirements.md`. These are
code-verified corrections (file/line evidence given in the Status column), not new opinions:

- **FR-14**: should read Defective, not Needs verification — the 10-char/no-max behavior is
  confirmed, not merely suspected.
- **FR-15**: should read Validated, not Needs verification — `submitted_at` exists.
- **FR-16**: should read Validated, not Needs verification — the duplicate guard exists.
- **FR-19**: should read Partial, not Unsupported — CSV export exists; this is the same
  underlying mistake as **D-20** in `docs/technical-assessment/technical-assessment-report.md`,
  now confirmed to appear in two documents.

`requirements.md` itself has not been edited — these corrections should go to Laeticia along
with the existing D-20 / FR-15-equivalent fix already queued for the technical assessment
report, rather than being silently overwritten here.

## Open items
- Test case IDs: none exist yet. Fill in as M4/M5 write unit, integration, and end-to-end
  tests in Milestone 2 (per the README's testing timeline).
- Workflow priorities (`critical-workflows.md`) are proposed, not sponsor-validated — revisit
  this matrix once Donald's sponsor session happens.
- FR-01, FR-10, FR-20: statuses depend on sponsor decisions or runtime checks not yet done;
  do not treat "Needs verification" here as a defect until confirmed.
