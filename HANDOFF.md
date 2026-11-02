# MCPA development handoff

This branch is for developer collaboration, not a Production release. Do not deploy, merge into a publishing branch, change Auth, or apply any Supabase migration automatically. Production and Staging must remain unchanged.

## Branch and scope

- Repository: `Waquinn/MCPA`
- Branch: `feature/ui-transfer-handoff-20261102`
- Source: `70d9c4668f4851248327c7e1fff09a7c4ae0602b`
- Intended stacked Draft PR base: `feature/engineer-ux-and-admin-invitations` (existing Draft PR #4).
- No changes are intended for `main`, `Updated-MCPARole`, PR #4's source, QA or integration branches.

## Four improvements

1. Project forms distinguish Engr and Architect profiles, retain authoritative profile UUIDs, and preserve unknown-profession assignments during metadata edits.
2. Sidebar groups collapse and expand with keyboard support, active-page highlighting, Register/Retire Equipment routes and existing role access, including Tool Handler Returns.
3. Existing screens retain light/dark and mobile behavior with shorter operational copy and visible custody/accountability details.
4. Transfers name an intended recipient who must explicitly accept or reject. Pending transfers retain sender custody; authorized cancellation, reservations and audit history are preserved.

## Architecture and security

- `js/environment-policy.js`, `js/environment.js` and `js/supabase-bootstrap.js` centralize fail-closed client configuration. The SDK facade has no prototype, exposes only guarded construction, rejects custom transport options and distrusts unverified reused clients. The staging source permits only project `blqlwfoserguserzmggo`.
- `js/upgrades/transfer-review/transfer.mjs` presents the focused transfer snapshot and uses the existing custody API's idempotent operation recovery. SQL remains the authorization authority.
- Acceptance locks current equipment and rechecks condition, source custody, retirement, reservations and competing unresolved movements before the atomic receipt engine runs. Rejection/cancellation can resolve condition drift without changing equipment custody.
- Inventory/profile actions bind Asset IDs as data. Print labels use DOM text bindings, avoiding executable identifier interpolation.
- Shared record-aware presentation requires complete per-ID inspection evidence before displaying Accepted. Partial, missing, disputed and incomplete historical receipts remain distinct; history is not rewritten.
- Both transfer forms share role/project recipient labels and disambiguate duplicate names with permitted profile UUIDs.
- Equipment QR uses the locally bundled qrcode encoder, preserves the plain Asset ID scanner payload and prepares a 30mm print tag. Licenses/provenance are under `vendor/equipment-qr/`.

## Local setup and exact tests

Use Node.js 24 and npm. From the repository root, install only the locked test dependencies if they are not already available:

```powershell
npm ci --prefix tests --ignore-scripts
node scripts/test-ui-transfer-handoff.cjs --node
node scripts/test-ui-transfer-handoff.cjs --browser
```

The browser suite needs Google Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`. If a constrained local environment requires Chrome's sandbox disabled, use an isolated machine with synthetic fixtures only and explicitly set `MCPA_CHROME_NO_SANDBOX=1` for that test process; ordinary local execution should retain Chrome's sandbox.

The Node command runs 168 cases: 160 passed, 0 failed and 8 explicitly blocked/skipped. The browser command runs 15 cases. Combined unique result: **175 passed, 0 failed, 8 blocked**. Reruns and syntax/catalog checks are not counted again. Current publication validation is recorded in `documentation/handoff-20261102/VALIDATION.md`.

These commands use disposable PGlite databases and mock service transports. The browser starts an ephemeral loopback server, never port 4179, blocks nonlocal requests and uses a temporary browser profile. Browser output is isolated under `documentation/handoff-20261102/local-runs/`; screenshots are disabled by the handoff runner. Do not commit generated output, local configuration, caches, browser profiles or test databases. The runner is the supported reproduction command; older browser modes can write their own evidence directories.

PGlite serializes database sessions. Its atomicity/sequential-drift results do not prove independent PostgreSQL concurrency. Browser configuration tests use synthetic SDKs and keys. Print-document preparation and pixel decoding do not establish physical camera/printer operation.

## Public configuration requirements

Runtime configuration is `window.MCPA_SUPABASE_CONFIG` with `url` and `anonKey`. The public staging URL must be exactly `https://blqlwfoserguserzmggo.supabase.co`. No real key is included in this handoff. Never supply a secret/service-role key.

The offline artifact builder reads `MCPA_PUBLIC_SUPABASE_KEY` and accepts `--environment staging --project-ref blqlwfoserguserzmggo --out <new-directory-inside-checkout>`. It creates `js/public-config.js` and `_headers` only inside that new output directory, refuses existing outputs and does not serve or deploy. Keep generated configuration/artifacts private and uncommitted. Missing public configuration deliberately prevents a live client from being created. Do not connect the frontend to Staging until separately authorized.

The separate Production-policy builder path is tested with synthetic configuration only and is not authorization to build, publish or connect to Production. Do not change Pages settings or the source staging policy to bypass validation.

## Prepared SQL, not live changes

- Migration: `supabase/migrations/202611020001_transfer_acceptance.sql`
- Read-only inspection: `supabase/transfer-acceptance-preflight.sql`

The migration is prepared and was applied only to disposable local fixtures. It must NOT execute automatically. Do not run `supabase db push`, a remote reset, or any connected migration command.

Review requires the integrated quantity/custody migrations, correction `202610250004`, PR #4 prerequisites and existing authorization/monitoring helpers. Local fixtures explicitly load these dependencies; live compatibility is unverified. The preflight checks signatures/definitions, owners, effective ACLs, RLS/policies, guards, reservation constraints, pending/historical associations, Office configuration and installed markers. Baseline: 355 PASS, 0 FAIL, 1 REVIEW_REQUIRED across 356 rows.

`live.provenance-and-concurrency` always requires independent release provenance and separate PostgreSQL session evidence. It is an explicit release gate, not a fixture data failure. Missing objects, permission errors, mismatches or installed markers mean stop and investigate; never replay the prepared migration blindly.

**Staging SQL inspection is authorized only after separate approval.** An approved operator must first verify project reference `blqlwfoserguserzmggo`, execute only the complete preflight (BEGIN READ ONLY through ROLLBACK), retain all result sets and errors, and stop for review. This handoff does not execute or authorize that connected step.

## Eight remaining validation gates

All remain BLOCKED:

1. Live Staging schema compatibility and approved migration provenance.
2. Real public Staging configuration/key validation.
3. Actual Supabase SDK/Auth/RLS/Storage/Realtime integration.
4. Independent PostgreSQL condition-change/cancel/accept contention.
5. Migration approval and connected application.
6. Authenticated live Staging end-to-end workflows.
7. Deployed CSP response headers and redirect enforcement.
8. Physical receiving-QR camera/device validation.

## Continue development

```powershell
git clone --branch feature/ui-transfer-handoff-20261102 https://github.com/Waquinn/MCPA.git
cd MCPA
npm ci --prefix tests --ignore-scripts
node scripts/test-ui-transfer-handoff.cjs --node
```

Read this document and the prepared SQL before changing behavior. Make further changes on a separate development branch based on this handoff, retain the existing role/custody invariants and request review through a Draft PR. Do not merge or deploy. Credentials, user records and bulky local test evidence must stay out of Git.

The original remediation report is retained at `documentation/seven-finding-remediation-20261102/REPORT.md`. Its full raw evidence/snapshots remain preserved locally and are intentionally excluded from publication. Sanitized publication verification is under `documentation/handoff-20261102/`.
