# Security gate policy and triage

**Backlog:** CICD-24 · **Owner:** M3 (Laeticia) · **Status:** proposed 2 Oct 2026; accepted when the team leader merges it
**Milestone:** 2 (security triage and gates) · **Next review:** Milestone 3 review, 30 Nov 2026

This is the written policy behind the security checks on every pull request, and the record of what was
found in the inherited code and what was decided about it. The sponsor's guide asks for dependency
validation, security scanning and "quality gate validation": a change that fails a required gate must
not be merged.

## 1. What blocks a merge

| Check | Blocks when | Notes |
|---|---|---|
| **OWASP Dependency-Check** (`Security scan` workflow) | A finding with **CVSS 7.0 or higher** is not in `.github/dependency-check-suppressions.xml` | Runs on every pull request, on `main` and every Monday |
| **CodeQL** (GitHub code scanning, default setup) | The pull request introduces a **new** alert | Alerts that were already open on `main` do not block; see section 5 |
| **Secret scanning with push protection** | A push contains a detected secret | Already on |
| **Dependabot alerts** | Never blocks | Triaged here (section 4) and fixed by version updates where a patch exists |

A check blocks only when it is a *required* check in the `main-protection` ruleset. **A passing scan and
closed alerts are different outcomes:** a green OWASP job means every finding at or above the threshold is
either fixed or an accepted risk written down below, not that the dependencies are free of known
vulnerabilities. Likewise a green CodeQL check means the pull request added no new alert, not that
the old ones are gone.

## 2. Accepting a risk

A risk is accepted by adding an entry to `.github/dependency-check-suppressions.xml` in a pull request
that M3 or the team leader merges. An entry has to:

- name **one advisory** for **one exact package version** (a new advisory, or a new version, is not covered);
- have an **expiry date** (`until=`), after which the finding blocks again and must be reviewed;
- explain **why it is tolerable** in its notes, and appear in the table in section 3.

`src/backend/tests/securitySuppressions.test.js` fails the build if an entry is missing any of these, so
a suppression cannot be added quietly. Fixing the finding (upgrading) is always preferred; if a suppression
is no longer needed, delete it.

## 3. Accepted risks: OWASP Dependency-Check (2 Oct 2026)

OWASP scanned 122 dependencies and found 23 issues: 9 at CVSS 7 or higher (the blocking ones), 13 moderate,
1 low. **All 9 are in the frontend lockfile and reach the project only through `react-scripts` 5.0.1** (the
inherited Create React App build tooling). The backend has none. `npm audit` for the backend reports 0.

None of these packages is part of the frontend production bundle or the backend runtime: they are used at
build time or by the development server (`npm start`), which is never deployed. Render builds the static
bundle with `npm run build` and serves only its output. Upgrading is not possible without replacing
`react-scripts` (no newer 5.x exists), and replacing the build tool is outside the sponsor's scope
("replacing the existing technology stack"; a Vite migration is recommended as future work).

| Advisory | Package | CVSS | Reached through | Used for |
|---|---|---|---|---|
| GHSA-2p49-hgcm-8545 | svgo@1.3.2 | 8.2 | react-scripts > @svgr/webpack > @svgr/plugin-svgo | build: SVG-to-component transform |
| GHSA-w27v-7q3p-w38r | svgo@1.3.2 | 8.2 | react-scripts > @svgr/webpack > @svgr/plugin-svgo | build: SVG-to-component transform |
| GHSA-5c6j-r48x-rmvq | serialize-javascript@4.0.0 | 8.1 | react-scripts > workbox-webpack-plugin > workbox-build > rollup-plugin-terser | build: service-worker generation |
| GHSA-86w9-cpqp-85rv | node-forge@1.4.0 | 7.5 | react-scripts > webpack-dev-server > selfsigned | development server only |
| GHSA-rp65-9cf3-cjxr | nth-check@1.0.2 | 7.5 | react-scripts > @svgr/webpack > @svgr/plugin-svgo > svgo > css-select | build: SVG transform |
| GHSA-6g55-p6wh-862q | postcss@7.0.39 | 7.5 | react-scripts > resolve-url-loader | build: CSS loader |
| GHSA-r28c-9q8g-f849 | postcss@7.0.39 | 7.5 | react-scripts > resolve-url-loader | build: CSS loader |
| GHSA-w5hq-g745-h8pq | uuid@8.3.2 | 7.5 | react-scripts > webpack-dev-server > sockjs | development server only |
| GHSA-g84c-rxfj-3j2c | webpack-dev-middleware@5.3.4 | 7.4 | react-scripts > webpack-dev-server | development server only |
| GHSA-vfj7-8cjw-p6xm | braces@3.0.3 | 7.5 | react-scripts > eslint-webpack-plugin > micromatch, and react-scripts > tailwindcss > chokidar | build: file-pattern matching (no patched version exists) |

The braces entry was added the same evening (backlog CICD-53): OWASP started reporting GHSA-vfj7-8cjw-p6xm (published 18 Sep 2026, no patched version) after the first nine were triaged, and the check blocked every pull request. It is the tenth accepted risk.

**Owner:** M3 · **Review:** Milestone 3 review (30 Nov 2026) · **Entries expire:** 31 Dec 2026. The
14 findings below CVSS 7 do not block and are not suppressed; they appear in the job summary and the
report artifact.

## 4. Dependabot alerts (23 open on 2 Oct 2026)

Dependabot lists the same tooling: 9 high, 13 medium, 1 low, all in the frontend lockfile, all reached through
`react-scripts` (`svgo`, `postcss`, `serialize-javascript`, `nth-check`, `node-forge`, `webpack-dev-middleware`,
`webpack-dev-server`, `uuid`, `underscore`, `yaml`, `@tootallnate/once`). `node-forge` has no patched version.
Dependabot's severity differs from OWASP's CVSS for some (for example `underscore`, "high" in Dependabot,
CVSS 5.9 in OWASP), so the blocking threshold above is the one that counts.

**Disposition (applied 2 Oct 2026):** the team leader dismissed all 23 as "tolerable risk" with a comment
pointing to this document, so the Dependabot tab shows only alerts nobody has looked at. Dismissing an alert is
a security decision and is done by a repository admin, not by automation. New alerts on the same packages are
dismissed the same way. This is also "fix A" of backlog CICD-12 (the failed Dependabot security-update checks
on `main`).

## 5. CodeQL alerts (4 open on 2 Oct 2026, after rate limiting and injection fixes closed 86)

| Alert | Where | Verdict |
|---|---|---|
| js/sql-injection (4) | `authController.js` lines 20, 75, 126 (email) and 156 (reset token) | **Real: query built from request body values.** Line 156 is the worst: `updatePassword` accepted an object such as `{"$ne": null}` as the token, which matches any professor with a pending reset and lets an attacker set that account's password. Fixed by requiring text (#100, #101). |
| js/sql-injection (3) | `courseController.js` lines 38, 90, 168 | Query built from query-string or body values; fixed by requiring text (#100, #101) |
| js/sql-injection (1) | `studentController.js` line 24 | `addStudent` duplicate check built from a body value; fixed by requiring text (#100, #101) |
| js/sql-injection (1) | `studentController.js` line 203 | Looks like a false positive: the filter values come from URL path parameters (always text) and the update is built from four fields that are checked to be text. Closed by validating the student ID before the query |
| js/path-injection (4) | `studentController.js` lines 376, 409, 592, 618 | False positives: `req.file.path` is built by multer as `uploads/<32 random hex characters>`; the client controls only the original file name, which is never used in a path |

CodeQL runs on every pull request and its check fails on a new alert. Making it a required check means a
new injection or path problem has to be fixed or explained before it can merge.

## 6. Review

- At each milestone review (next: 26 Oct, then 30 Nov): re-run the counts above, delete suppressions that are no
  longer needed, and re-justify any that remain.
- When a suppression expires the OWASP job fails on that finding. That is the prompt to review it, not a
  reason to extend the date without looking.
- New alerts from CodeQL or new findings from OWASP are triaged in the pull request that introduces them.
