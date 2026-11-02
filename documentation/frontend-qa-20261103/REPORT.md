# MCPA frontend QA report

Date: 3 November 2026, Asia/Manila. Scope: offline frontend inspection, justified corrections, and regression testing.

## A. Executive summary

**The assigned offline frontend work is complete. Connected integration and release validation remain partially complete because eight gates are blocked.** Five confirmed frontend issues were corrected while preserving the existing equipment, custody, project, navigation, QR, and role workflows.

Final results: **194 passed, 0 failed, 8 blocked/skipped**. These are registered test-case counts, not a count of unique business assertions. Baseline runs, reruns, individual assertions, screenshots, syntax checks, and detector results are not added to that total. Machine-readable case names, source files, classifications, and results are in [RESULTS.json](RESULTS.json).

Work is isolated on `feature/frontend-qa-polish-20261103`. No commits, pushes, merges, deployments, live database changes, account changes, or production connections were performed.

## B. Features tested

Evidence abbreviations: N = the final Node run, with all 168 cases catalogued in RESULTS.json; H = the original 15-case browser suite; F = the new 19-case browser suite. Browser services and authentication are mocked. SQL checks use disposable PGlite fixtures, not connected Supabase.

| Module | Test scenario | Result | Evidence |
|---|---|---|---|
| Transfers | Initiate with eligible equipment and named recipient; show Pending Acceptance; retain sender custody | PASS, offline | N: initiation/reservation cases; H: Engineer/Admin requests; F: exact recipient submission and delayed response |
| Transfers | Intended recipient reviews and accepts; custody changes after successful server response | PASS, offline | H: Engineer and Admin acceptance; F: delayed confirmation, duplicate-submit guard, and final focus |
| Transfers | Reject with remarks; original custodian remains | PASS, offline | N: terminal rejection/reservation release; H: rejection and unchanged custody |
| Transfers | Authorized sender cancels; completed/rejected records cannot be canceled; unauthorized controls absent | PASS, offline | N: Admin/Engineer/Architect cancellation and terminal-state cases; H: unavailable-recipient cancellation; F: absent unauthorized controls |
| Conditions | Good, Damaged, mandatory damage notes, Damaged-to-Good recovery | PASS, offline | N: good/damaged receipt and repair preservation; H and F: native validation recovery |
| Conditions | Under Repair restrictions, pending condition drift, missing/disputed historical receipts | PASS, offline | N: normalized Under Repair, unresolved movement and condition-drift cases; H: accurate historical receipt labels |
| Identity | Duplicate names remain distinct; project/role context and exact profile ID govern selection | PASS, offline | H: duplicate real fixture profile UUIDs in both composers; F: submitted identity and incoming record identity |
| Error recovery | Failed initial read, failed mutation, saved action followed by failed read, failed background synchronization | PASS, mocked browser | F: retry works; stale acceptance controls disappear; inspection values remain after rejection or failed background read |
| Navigation | Collapsed initial groups, one expanded group, second-click collapse, active state, direct links, refresh | PASS, offline | H: Admin/Engineer paths; F: Engineer/Architect/Tool Handler direct refresh and keyboard accordion |
| Role UI | Admin registration/retirement retained; operational role restrictions preserved | PASS, offline | H: registration route and Engineer exclusions; F: role menus; N: permissions/router checks |
| Returns | Tool Handler monitoring interface retained; Engineer/Architect return submission routes retained | PASS, offline | H and F: role-specific Returns mounts |
| Accessibility | Keyboard accordion, visible focus, mobile drawer Tab containment, Escape and focus return | PASS, bounded Chrome checks | H and F; F verifies transfer/navigation focus contrast of at least 3:1 in both themes |
| Projects | Create/edit, Engr/Architect choices, required fields, profile UUID persistence, unavailable-profession preservation | PASS, offline | H: create, edit, reassignment and unknown-profile metadata update; F: empty-create validation; N: project persistence/history |
| Projects | Profession labels, existing assignment details, desktop/tablet/mobile | PASS, bounded Chrome checks | H: separators and unknown profession; F: 1440px, 768px and 390px dialog checks |
| QR / Print Tag | Local encoder, exact plain Asset ID payload, rendered pixels, print preparation and 30mm QR CSS | PASS, offline | H: real View/Edit/Print handlers, PNG decoding and 30mm print document |
| QR | Quotes, markup/event syntax, Unicode and long identifiers | PASS, offline | H: injection-shaped identifiers safely bound as text; F: Unicode/punctuation/long-ID pixel decoding |
| CSP / isolation | Strict shipped staging meta CSP and fail-closed config/client construction | PASS, synthetic | N and H: no real key or SDK connection; real browser CSP with synthetic SDK |
| Themes / layout | Light/dark transfers; 1440, 768, 390 and 320px viewports; long record/equipment IDs | PASS, bounded Chrome checks | F: no document or component horizontal overflow at all eight size/theme combinations; before/after screenshots |
| Live integration | Actual Auth, SDK, RLS, Storage, Realtime and staging workflows | BLOCKED | No connected testing authorized; gates below |
| Physical devices | Camera scanning and physical printer output | BLOCKED / UNVERIFIED | Pixel decoding and print-document preparation cannot verify hardware |

## C. Confirmed issues

| Severity | Defect and impact | Root cause | Affected source |
|---|---|---|---|
| P1 Major | After a successful acceptance followed by snapshot failure, the old Pending Acceptance record and acceptance form remained actionable | The mutation settled before refresh, but the previous DOM was retained if the subsequent snapshot rejected | `js/upgrades/transfer-review/transfer.mjs` |
| P2 Minor | An initial read error left the component showing loading copy without its own retry | Initial setup loading markup survived the rejected snapshot; recovery depended on the outer synchronization toolbar | `js/upgrades/transfer-review/transfer.mjs` |
| P2 Minor | Incoming/history details displayed only the recipient name, leaving duplicate names ambiguous after submission | The record used `receiver` for presentation but omitted its already-authorized `receiverId` | `js/upgrades/transfer-review/transfer.mjs` |
| P2 Minor | Long identifiers expanded the page and shrank mobile content, making operational details difficult to read | Transfer summaries, inspection headings and other unbroken identifiers did not inherit a wrapping rule | `js/upgrades/transfer-review/transfer.css` |
| P1 Major | Keyboard focus used bright gold against pale surfaces, providing inadequate non-text contrast in light mode | Local focus rules overrode the existing darker gold focus token with `--gold` | `css/layout.css`, `js/upgrades/transfer-review/transfer.css` |

The initial supplemental browser pass reproduced the first four issues: 12 cases passed and four failed. Focus contrast was confirmed from the source colors; the final computed-style check verifies the replacement against both theme surfaces. No backend authorization bypass was established.

## D. Implemented fixes

| Changed file | Change and reason | Evidence of correction |
|---|---|---|
| [transfer.mjs](../../js/upgrades/transfer-review/transfer.mjs) | Show the recipient's existing profile ID as secondary record information. Add loading/retry recovery. Invalidate old controls after confirmed mutations. Serialize refreshes and restore focus to the resulting record. Keep unsaved form contents when an ordinary background read fails | F: recipient identity, delayed/failed responses, retry, stale-action removal, draft preservation and focus assertions |
| [transfer.css](../../js/upgrades/transfer-review/transfer.css) | Wrap long identifiers, style the secondary profile ID, use darker theme-aware gold focus, and include inputs in explicit focus styling | F: eight size/theme combinations without overflow; computed focus contrast |
| [layout.css](../../css/layout.css) | Use the existing `--gold-dim` token for sidebar keyboard focus | F: light/dark focus checks; existing drawer and accordion checks remain passing |
| [auth.browser.cjs](../../tests/auth.browser.cjs) | Add an explicit supplemental QA selector and request/response counters while retaining the existing loopback-only interception | H: all 15 original cases pass; F: 371 local requests permitted and zero nonlocal HTTP responses observed |
| [browser-checks.cjs](../../tests/frontend-qa/browser-checks.cjs) | Add 19 focused synthetic browser cases, bounded screenshots, result recording and optional screenshot suppression | Final focused run: 19 passed, zero failed |
| [RESULTS.json](RESULTS.json) | Retain sanitized case names, source mapping, exact totals, network observations and earlier failure history | Counts reconcile to 194 passed and eight blocked |
| [REPORT.md](REPORT.md), [.gitignore](.gitignore) | Record the review and exclude this QA directory's raw logs/screenshots from Git | Local evidence stays available without entering the reviewable source set |

No project, QR encoder, public API, permission-policy, authentication, environment-guard or SQL source changes were necessary. Existing tests were extended without weakening their expectations.

## E. UI/UX improvements

Record identity remains visible after transfer submission without querying additional directory information. Failed loads now explain recovery inside the transfer surface. A saved action cannot leave an obsolete acceptance form on screen. Rejected operations retain inspection input, and failed background reads retain drafts. The resulting record receives keyboard focus after a successful action. Long identifiers wrap rather than widening the viewport. Focus uses the existing gold palette with stronger contrast.

MCPA branding, both themes, primary gold actions, inventory/custody information, history and authorized modules are preserved. Projects and QR were retained because the inspected behavior passed.

The design detector reported zero primary findings and 37 advisories when comparing existing workspace styles with login-specific DESIGN.md metadata. Those advisories were reviewed as context mismatch/pre-existing values; no detector suppressions were added. Impeccable also reported a stale design sidecar; `impeccable document` is its available repair, outside this frontend correction scope.

## F. Test results and reproduction

| Verification method | Passed | Failed | Blocked/skipped |
|---|---:|---:|---:|
| Node unit/client/static checks, including synthetic edge-handler and artifact-builder checks | 89 | 0 | 0 |
| Existing SQL behavior in disposable PGlite fixtures | 71 | 0 | 0 |
| Original mocked browser suite | 15 | 0 | 0 |
| New focused mocked browser suite | 19 | 0 | 0 |
| Explicit connected-environment / physical-device gates | 0 | 0 | 8 |
| **Total** | **194** | **0** | **8** |

Node classifications were reconciled from the final TAP case names to their source files. The mixed QR test file contributes three database cases and one client case. The blocked tests are explicit skips, not successful integration checks.

Starting baseline: Node 160 passed, zero failed, eight skipped; original browser suite 15 passed, zero failed. The initial new suite was 12 passed/four failed. An intermediate verification was 18 passed/one failed because a newly added test expression used top-level await in a classic-script context; wrapping it in an async function corrected the test without changing product behavior. The final supplemental run passed all 19 cases.

Additional verification, excluded from totals: syntax checks for the changed JavaScript files; `git diff --check`; one design-detector pass; source/diff inspection; before/after screenshot inspection. Chromium reported no uncaught browser exceptions. The focused network audit observed 371 allowed loopback requests and zero nonlocal HTTP responses. The harness permits only its ephemeral loopback server, blocks HTTPS, and uses a temporary Chrome profile with background networking disabled. This is browser-tab evidence, not an operating-system-wide packet capture.

Installed dependencies were reused; no installation or application preview against a real service was needed. Actual runtime: **Node v26.13.0**. Node v24, recommended by the handoff, was not available through the selected executable and was not independently tested.

Run from the repository root with the already-installed test dependencies:

```powershell
node scripts/test-ui-transfer-handoff.cjs --node
node scripts/test-ui-transfer-handoff.cjs --browser
node tests/auth.browser.cjs --seven-finding-remediation --frontend-qa
```

The supplemental command uses the reviewed fixture setup and network blocking in `tests/auth.browser.cjs`. It writes new disposable results/screenshots under `documentation/frontend-qa-20261103/local-runs/`. Set `MCPA_SKIP_SCREENSHOTS=1` for an assertion-only run. No `--no-sandbox` override was used.

Local raw evidence, excluded from Git:

- `baseline-node.log`, `baseline-browser.log`, `initial-focused-browser.log`.
- `final-node.log`, `final-handoff-browser.log`, `final-focused-browser-verified.log`.
- `local-runs/browser-d7IKK3/`: initial four failing cases and before screenshots.
- `local-runs/browser-4RGSIa/`: corrected interface screenshots; the only failed case in that run was the test-expression error described above.
- `local-runs/browser-yjUdd8/results.json`: final 19-case result and network audit, with further screenshots disabled.
- `../handoff-20261102/local-runs/browser-qflvpR/browser-results.json`: final original browser results.

## G. Backend issues requiring coordination

No new backend defect was confirmed, and no SQL change is proposed by this frontend pass. The existing eight gates remain:

1. Live Staging schema compatibility and approved migration provenance.
2. Validation of a real public Staging configuration/key.
3. Actual Supabase SDK/Auth/RLS/Storage/Realtime integration.
4. Independent PostgreSQL sessions for condition-change/cancel/accept contention; PGlite serializes sessions.
5. Migration approval and any connected application.
6. Authenticated Staging end-to-end workflows.
7. Deployed CSP response headers and redirect-chain enforcement.
8. Physical receiving-QR camera/device validation.

These require the responsible teammate/operator and the separate approvals described in HANDOFF.md. Mocked success establishes none of them. No messages were sent to other developers.

## H. Git status and preservation

Starting state:

- Branch: `feature/next-mcpa-improvements`.
- HEAD and original handoff branch: `d23618ed951704b33d374faa518214645283a6a2`.
- No staged or tracked working changes.
- Pre-existing untracked directories: `documentation/handoff-20261102/local-runs/` and `documentation/seven-finding-remediation-20261102/build-fixture-th7Ep6/`.
- One registered worktree, this checkout.

The new branch was created at the same commit; a narrow Git metadata permission escalation was approved because the sandbox initially denied creating its ref. The pre-existing untracked directories were preserved. Final branch: **`feature/frontend-qa-polish-20261103`**. HEAD, `feature/ui-transfer-handoff-20261102` and `feature/next-mcpa-improvements` still resolve to the starting commit.

Reviewable modifications are exactly the eight files listed in section D. Four are existing tracked files and four are new QA/test/documentation files. No files were staged. No commits, pushes, resets, merges, PR changes, publishing operations, deployments or other worktrees were changed by this session.

The Node fixture runs created additional untracked synthetic build outputs `build-fixture-SaAkbD/` and `build-fixture-FbCkDW/` under the existing remediation evidence directory. The browser runs added disposable outputs under the existing handoff local-runs directory. They are generated local evidence, not proposed source changes, and have not been staged or committed. This QA directory ignores its own logs and local-runs output.

No migration files or database authorization code changed. **Existing SQL executes only inside the disposable local test fixtures. No connected database migrations were applied.** No live database, authentication account/settings, GitHub Pages configuration or deployment was touched. Environment-policy/bootstrap source and application entrypoints are unchanged. The final source isolation test passed its embedded-credential and unapproved-endpoint checks; no new runtime service URLs or credentials were introduced.

No operations targeted a teammate's worktree or branch. Preservation is evidenced by the session's operations and final local Git refs; independent changes another person may have made outside this checkout are UNVERIFIED.

## I. Remaining issues and verification limits

- **Frontend defects:** no unresolved defect among the scoped cases. This is bounded workflow coverage, not certification that every screen is defect-free.
- **Backend dependencies / Staging:** the eight gates above remain blocked; no live integration result is reported as PASS.
- **Browser/accessibility coverage:** Chrome only. Screen-reader operation, other browser engines, exhaustive contrast coverage, performance benchmarks and Node v24 compatibility remain UNVERIFIED. Keyboard/focus checks do not establish full WCAG compliance.
- **Physical devices:** no camera or physical printer was operated. QR pixels and the CSS-defined 30mm QR square passed; physical dimensions and scan reliability remain UNVERIFIED. The whole printed label includes company/identifier text in addition to the 30mm QR square.
- **Design metadata:** login-only design context and the stale sidecar remain unchanged.

Proposed physical verification procedure, not executed: use synthetic identifiers in a verified offline fixture session with nonlocal traffic blocked; print at actual size with browser scaling disabled and measure the QR square; scan normal, punctuation and Unicode tags on a physical phone under typical site lighting and compare the decoded strings exactly. Verify permission-denied camera recovery using the same fixture. Do not supply production or live Staging configuration.

## J. Recommended next action

**Review the isolated frontend diff together with this QA report.** Stop at review; no commit, push, merge or deployment is authorized by this report.
