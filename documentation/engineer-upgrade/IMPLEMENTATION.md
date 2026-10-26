# SiteTrace engineer UX and Admin invitations

Implementation date: 2026-10-27 (Asia/Manila). Production has not been changed.

## Baseline and isolation

- Feature branch: `feature/engineer-ux-and-admin-invitations`.
- Isolated worktree: `.w/` inside the original repository's writable workspace. The initial longer worktree path exceeded Windows path limits; the successful worktree used Git's per-command long-path support. No original files or QA evidence were removed.
- Fetched Production: `5ad129fbb7d46acf842e0ad68b02d5689f21b40e` on `origin/Updated-MCPARole`.
- Authenticated GitHub Pages API confirmed legacy hosting from `Updated-MCPARole:/`, latest build `built` at that same commit. Hosted `index.html`, `js/auth.js`, and `js/integration.js` matched the Git blobs byte-for-byte.
- Original checkout remains on QA `5c468745375dac73daa80ff20765a29f4e6afb80`. Its untracked `FINAL_SYSTEM_QA/`, screenshots, logs, and documentation remain in place.
- Roland's `e5be0a1` My Consumables and QA `5c46874` were not merged wholesale. The only adapted QA infrastructure dependency is the server-side `manage-accounts/runtime.mjs` configuration reader, plus its ES256-compatible gateway configuration and extended browser CORS headers.

## Feature status

| Feature | Implemented behavior | Validation |
| --- | --- | --- |
| 1. Request classification | Explicit per-compatible-type `quantity` / `specific` configuration; Admin editor in Equipment Tracking. Existing recognized mixers, heavy-duty generators and compactors seed as specific; other existing/new types default to quantity. No equipment is created by the migration. | SQL rejects forged request methods; browser lists do not overlap. |
| 2. Retirement restriction | Engineer/Architect navigation and direct route permissions removed. Retirement details, event records, evidence authorization and report action use active Admin checks. Ordinary equipment lifecycle status remains available. | SQL and browser role checks; distinct second Admin approval retained. |
| 3. Quantity request UX/stock | Independent desktop cards, stacked mobile cards, focus guidance on selection, no nested catalog scroll. Only positive eligible standard stock appears. Pending quantity demand is deducted in addition to existing exact reservations, holds and custody locks. | Desktop/mobile and both themes; stale-stock draft, allocation, release and receipt tests. |
| 4. Automatic synchronization | Reuses `EquipmentTracking.watch`: Realtime hints, 30-second visible-only fallback, focus, reconnect and visibility handling. Integrated workflows now use the same lifecycle-managed watcher. Purchases, reports and consumables gain coverage; successful operations notify active watchers. Redundant request refresh controls become error-only Retry actions. | Burst coalescing, in-flight reads, failure recovery, draft retention, cross-account stock changes and navigation cleanup tests. |
| 5. Transfer projects | No project list until a recipient is selected; only that active recipient's assigned active/unarchived projects appear. This intentionally preserves legitimate transfers between different Engineers' projects. Server trigger validates current recipient membership under row locks and rechecks receipt of newly created transfers. | Manipulated project IDs and assignment changes rejected; valid cross-project custody accepted. |
| 6. Invitations | Active Admin issues supported non-Admin roles, chooses email or private-link delivery when enabled, views Pending/Accepted/Expired/Revoked, resends and revokes. Recipient verifies name, locked email, password and confirmation; activation follows trusted server validation. | Local SQL and Edge tests plus recipient browser flow. Actual Supabase delivery is unverified. |

Classification follows the existing exact compatibility hash (name, category, brand, model, details, condition, tracking type and unit). Editing those fields creates a different compatible type and may require the Admin to classify it. Asset IDs and serial numbers never decide the request method. Historical requests retain their stored type, identifiers and allocations; classification changes affect new submissions only.

Pending quantity requests now consume requestable capacity, but Admin still chooses the actual eligible individual Asset IDs at approval. Rejection releases that pending demand. Existing oversubscribed pending demand is not deleted; availability clamps at zero until it is resolved.

## Database and server changes

Prepared, applied only to disposable local PGlite databases:

1. `supabase/migrations/202610280001_engineer_request_permissions.sql`: classification table/Admin RPC, partial pending-demand index, catalog and submission wrappers, request/transfer validation trigger, Admin-only retirement authorization, and enriched authorized snapshots.
2. `supabase/migrations/202610280002_secure_invitation_registration.sql`: additive invitation expiry/acceptance/revocation fields, trusted provisioning/registration RPCs, pending-account activation guard, and Admin invitation status projection.
3. `supabase/functions/manage-accounts/{handler.mjs,index.ts,runtime.mjs}` and `supabase/config.toml`: server-only Auth Admin APIs, verified bearer identities, role checks and registration. Nothing deployed.

No Production migrations, policies, functions, records, Auth users, SMTP configuration or redirect settings were changed. No production service key was used for inventory tests. No secrets or private provisioning files belong in this branch.

## Security model

- Every non-OPTIONS Edge action authenticates the bearer using Auth `getUser`. Admin operations then require the linked active Admin profile; service-only SQL independently rechecks that Admin for every invitation step.
- Gateway `verify_jwt=false` is scoped to `manage-accounts`, matching the reviewed QA compatibility change for ES256 sessions/new API keys. It does not make invitations anonymous: the handler and SQL enforce identity/role checks. See [Supabase function authentication](https://supabase.com/docs/guides/functions/auth).
- Invitation roles come from the Admin-authorized durable record. Browser role, email, actor and user UUID fields are ignored for recipient activation. Creating new Admins still requires the incumbent separately authorized provisioning process.
- New invitation profiles remain inactive until registration is completed. Auth email confirmation alone cannot activate them. Public roles cannot call the provisioning/completion SQL functions or write invitation records.
- `accept` checks the current invitation, updates only the verified Auth user's password using the Auth Admin API, then rechecks and activates atomically in SQL. Expiry, revocation, replay, role changes or concurrent revocation fail closed. Passwords are never passed to SQL or custom tables.
- Copy links are produced by Supabase `generateLink` in the trusted function and returned only to the authenticated active Admin with `Cache-Control: no-store`. They are displayed transiently, never persisted in application storage or invitation tables. Share them only with the invited email owner. Auth enforces its one-time token behavior; the application imposes a further 24-hour registration deadline.
- Revoking an incomplete new invitation retains its records and leaves its account inactive. Accepted users are managed through existing account deactivation; revocation does not rewrite accepted history. Reusing a revoked email requires a separately reviewed recovery/re-invitation procedure, rather than silently reviving an old link.
- Existing sent invitation jobs remain under their incumbent behavior, avoiding arbitrary deactivation of existing accounts. New preparations, including reused unfinished prepared jobs, enter the guarded registration flow.
- Drafts on request and transfer composition refresh while keeping entered values. Other integrated inspection/retirement forms defer destructive rerenders while edits are unsaved; they sync after completion or navigation. No optimistic custody/issuance success is shown.

## Tests and evidence

Run from `tests/` after installing its locked dependencies:

```powershell
npm ci
npm run test:engineer-upgrade
```

This workspace reused the original checkout's installed test dependencies through `NODE_PATH`, without copying or changing them. The managed Windows runner also needed `$env:MCPA_CHROME_NO_SANDBOX='1'` for its isolated headless fixture; the browser harness blocks external HTTPS and never authenticates to Production. Chrome's normal sandbox startup timed out before tests began; rerunning with that test-environment setting worked.

`tests/engineer-upgrade/run.cjs` records exit codes and UTF-8 output in this directory. Final recorded result: **65 automated tests passed, 0 failed**, and all three browser flows passed: engineer upgrade, combined custody/materials, and unified quantity/specific requests. The follow-up `engineer-browser-final.log` also verifies immediate quantity correction and background synchronization of purchases, reports and consumables. `files-changed.txt` lists all committed source, test, migration and evidence paths.

Earlier diagnostic logs are retained, including resolved fixture failures (a missing import category/date, an obsolete error-copy assertion, and reuse of an already-locked test asset). They are not unresolved application failures. Final run logs above are authoritative.

The browser transport simulates Supabase Auth issuance, token delivery and password storage. It invokes the real invitation handler and local SQL authorization. This verifies application behavior, not SMTP delivery, actual GoTrue token expiry/replay, or a deployed Edge Function. PGlite executes real PostgreSQL/RLS/functions but serializes its single local connection; the competing-submission test validates atomic results, not multi-server load/lock contention.

The old combined browser fixture's Engineer retirement-history expectation and manual-refresh step were updated to the intentional permissions/automatic-sync behavior. The quantity client test's obsolete error-copy assertion was updated. Old manual-overlap browser scenarios in `--final-races` are not the selected regression flow; active watcher coalescing and disposed/stale-response tests provide the relevant checks. Existing database/import race coverage still runs. The previously reported 15 historical browser failures are not represented as new application defects.

Current screenshots: `.impeccable/review/final/upgrade-*.png`; the preceding round is preserved in its parent directory. Synthetic records and links are clearly test fixtures. `design-review.md` contains the initial independent review and `design-verdict.md` scores its one requested transfer-message fix resolved with disposition `ship` at that scope. `design-documentation.md` records the incumbent-system comparison. `design-detector.json` records inherited typography/token findings (the incumbent DESIGN.md covers login, not all workspace tokens).

## Delivery/configuration status

Read-only Production Auth settings returned: email authentication enabled, public signup enabled, email auto-confirm disabled. Public settings do not expose SMTP configuration. No Supabase management token/staging project or recipient mailbox was available to inspect SMTP secrets/configuration or perform a real delivery test. Email delivery and actual hosted copy-link consumption are **not verified**.

Before enabling invitations in the target environment:

1. Use a dedicated Staging Supabase project and staged app URL. Confirm the existing Production prerequisite migrations through `202610250004_read_rpc_authorization.sql` are installed. Do not replay old migrations over an existing environment.
2. Apply the two new migrations in filename order; run `preflight.sql` before and `verify.sql` afterward.
3. Configure Auth Site URL and allowlisted redirect exactly as the staged login, then for the approved release use `https://waquinn.github.io/MCPA/index.html?account_setup=invite`. Keep the default email template's Supabase confirmation URL or a correctly configured equivalent; do not replace it with an unverified public signup route.
4. In Auth settings disable public account signup for invitation-only provisioning; preserve existing Auth users. Keep email confirmation enabled. Review password policy (application minimum 12, maximum 128 characters) and set Auth email-link expiry at or below 24 hours.
5. Configure custom SMTP: verified sender/domain, provider host/port/username/password, TLS and provider-side DNS requirements. Store credentials only in Supabase/provider settings. The default Supabase mailer is restricted; see [Supabase SMTP setup](https://supabase.com/docs/guides/auth/auth-smtp).
6. Set Edge `MCPA_APP_URL` to that environment's exact login URL and configure an injected server key (`MCPA_SUPABASE_SECRET_KEY`, runtime injected default, or `SUPABASE_SERVICE_ROLE_KEY`). Do not use frontend variables or commit secret files. Keep development-account creation disabled for release.
7. Deploy `manage-accounts` using this branch's function configuration. Set `MCPA_INVITATION_LINKS_ENABLED=true` only when Admin private links are desired. Set `MCPA_EMAIL_INVITATIONS_ENABLED=true` only after SMTP configuration; that flag is configuration, not proof of delivery. With both false, issuance stays disabled while existing accounts work.
8. Deploy the staged frontend; verify a real Admin invitation into a controlled mailbox, allowed redirect, registration, subsequent login, resend, revoked/expired/reused token handling and non-Admin rejection. Verify a private link separately. Perform a two-session/multi-connection stock and assignment race test in Staging.

## Compatibility and integration

This is a Production-based feature branch, not a QA branch merge. Roland's My Consumables work remains on its existing branch. A future merge with QA conflicts in Auth, People, account handler/config and account tests are expected: QA's `202610270001_remove_user_invitations.sql` removes infrastructure required here and must NOT be applied alongside this workflow. Reconcile that migration explicitly in an integration branch; do not cherry-pick its removal over these migrations. QA self-profile and consumable unit fixes are separate changes, not bundled into this feature.

The existing quantity/specific history, exact allocation, separate release and inspection, permanent equipment identity, Office-only return, consumable approval/actual issuance and two-Admin retirement paths are retained. Staging is still required to verify the deployed schema and Auth runtime configuration.

## Deployment order and rollback

Production deployment is not authorized by this implementation request.

1. Review the draft PR, current baseline, changed-file manifest, security checks and local evidence.
2. Complete the staged sequence above and attach real delivery/multi-session evidence to the PR.
3. Obtain separate explicit approval for Production SQL, Edge deployment, merge and Pages release.
4. At an approved maintenance window, disable issuance flags, capture a database backup/function definitions and deployment versions, apply `280001` then `280002`, run verification, configure Auth/SMTP, deploy Edge, then merge the reviewed frontend to `Updated-MCPARole` and confirm its Pages commit.
5. Validate existing-user login and both account roles, request/allocation/release/acceptance, transfer authorization, Office returns, actual material issuance and two-Admin retirement. Enable the selected issuance flags and perform a controlled hosted invitation test before declaring delivery operational.

Rollback is deliberately non-destructive: immediately set both issuance flags false; restore the previously recorded Edge version and frontend `5ad129f` artifact through a separately reviewed revert/release. Retain additive columns/tables, invitation/account audit and pending-account activation guards. Pending new recipients stay inactive; do not mass-activate or delete them. The old frontend may display additional request options that the strengthened backend rejects; the quantity workflow remains available. Prefer a forward fix. A full database downgrade requires separate review of all post-upgrade invitations and requests; do not drop tables, remove audit history, or restore broad retirement permissions as an automatic rollback.

## Remaining release gates

- High: staged Auth/SMTP/redirect and real recipient delivery validation; Production public signup must be reviewed/configured for invitation-only use.
- High: no approved Production SQL/Edge/merge/deployment; nothing is live from this branch.
- Medium: real multi-connection contention and deployed Realtime publication need staged verification; polling/focus fallback does not depend on publication changes.
- Medium for future QA integration: explicitly reconcile the invitation-removal migration and overlapping account/Auth changes.

Safest next step: review the draft PR and validate it against a separate Staging project with controlled recipients before authorizing any Production change.
