# Project review and implementation report

## Findings and root causes

- **Masterlist disappeared after returning:** the router reinjected a classic script declaring global `let`/`const` variables. Redeclaration stopped execution before the fresh table could load. Fetching also repeatedly attached checkbox listeners. Scripts now register once, while each mounted page gets fresh state, listeners and reads.
- **Incorrect site assignments:** equipment has `site_id`, not `site`. The old bulk action wrote the nonexistent column and the table invented a Casa Buena default. Forms, filters and bulk assignment now store site UUIDs and resolve names from `sites`.
- **Categories were disconnected:** existing `equipment.category` is text; no exposed category reference table exists. Choices now come from current equipment records, with a validated new-category option and correct edit/save/filter behavior.
- **Navigation races and stale state:** slow loads could replace the current page, scripts could use old DOM references, and profile inline styles could override screen visibility. The shared router now manages mount/destroy, aborts, loading/errors and latest-navigation checks.
- **Placeholder authentication and settings:** Sign In previously just hid the login screen; profile values and notification claims were fabricated. Existing-account authentication, session restoration and sign-out are implemented. Public prototype access is labeled accurately. Settings saves real profile names and persistent browser preferences; unavailable notification delivery and phone editing are no longer presented as working features.
- **Static operational screens:** all five Movement screens and Dashboard/Purchases/Reports/Activity/Users previously displayed sample records and nonfunctional actions. They now read actual records and provide implemented actions appropriate to the existing schema.

## What changed

### Masterlist and Sites

Masterlist now reloads equipment/reference data on every mount and form opening; addresses records by UUID; preserves zero quantities; handles supported status values; resolves holders; and implements create, edit, delete, bulk changes, search, filters, pagination, real history and print/export feedback. Asset tags use UUIDs instead of collision-prone four-digit random numbers. Stale single-record edits check original assignment/status/quantity. Historical equipment deletion and open-movement conflicts are enforced by the Movement database guard.

Sites retains its existing CRUD and equipment views. It now participates in the shared lifecycle and reads recorded equipment history, including the last confirmed transfer. Site renames preserve equipment assignments. Missing history is never reconstructed from current location or example records.

### Movement

Requests, Transfers, Returns, Repairs and Missing use one shared controller and actual equipment/site/profile references. Requests progress through approval, release and receipt; transfers update custody on receipt; returns record condition; damaged returns open a repair case atomically; lost items are reported through Missing so custody is retained; repair and missing outcomes update equipment and append history. Open workflows reserve the complete equipment entry, including its full quantity.

The migration extends existing `equipment_transfers` and `equipment_history`; it does not create a parallel movement ledger. Original legacy statuses/records remain intact. New workflow status is separate to avoid reinterpreting existing values. RPCs lock rows, reject stale/invalid transitions, prevent conflicting workflows and roll back equipment changes if history cannot be written. Historical site/equipment links are protected.

### Settings, sessions and other modules

- Settings persists theme, Masterlist page size and start page in this browser. Profile name updates use an authenticated function constrained to `auth.uid()`; role and account email are read-only.
- Dashboard counts come from equipment quantities, actual sites and consumable stock. Attention links and quick actions work.
- Purchases reuses the Consumables request/receipt RPCs. Partial/full receipts, cancellations and retries preserve stock integrity and use the same request reference on both screens.
- Reports has eight actual datasets, search, pagination, CSV and print/PDF. CSV values are escaped against spreadsheet formula execution.
- Activity combines recorded equipment events and consumable stock history; it no longer claims to audit actions for which no ledger exists.
- Users displays actual profiles and current-account information. Fake invitation/edit controls were replaced by clear account-administration guidance.
- Consumables retains its working database behavior; polling stops when the module is destroyed.
- New supporting text, feedback, headings, controls and identifiers use the existing Public Sans, Fraunces, JetBrains Mono and theme tokens. Copy avoids unnecessary implementation detail. Light/dark and narrow layouts were checked.

## Database/setup changes

Apply the documented sequence in [README.md](README.md). New schema work is limited to `database/movement.sql` and `modules/settings/setup.sql`. Neither script deletes existing business records or seeds fake data. Existing Sites/Consumables setup remains the dependency. No category or settings table was added.

The current prototype allows public application access. Movement follows that model explicitly and records authenticated actors when present. This is a compatibility choice, not production role enforcement. No Engineer role was implemented.

## Verification and limits

Final combined run: **all 10 suites passed** (four database suites and six browser suites), exit code 0. JavaScript syntax checks passed for 33 files. The browser suites reported no uncaught exceptions.

Database and browser regression suites run locally against mocks or the actual SQL in isolated PostgreSQL. They cover all existing modules, Masterlist revisits and CRUD, new site/category choices, forms, filters/paging, bulk actions, workflow outcomes, SQL rollback/conflicts, purchase receipts/retries, settings/session persistence, asynchronous navigation, escaping, responsive layouts and uncaught browser errors. See the test runner and module READMEs for exact scenarios.

Live Supabase access was read-only for inspection. Administrative schema access and real account credentials were not available; migrations were **not applied to the live database**, and live authentication/RLS behavior was not certified. External QR rendering/physical printing cannot be verified by suites that intentionally block external network requests.

Remaining technical debt and future-role recommendations:

- Export and version the original equipment/profile schema, full policies and constraints. The repository did not contain that baseline.
- Replace prototype access with server-enforced role/site/recipient permissions before deploying Engineer accounts. Keep authorization inside RLS/RPCs and use authenticated account IDs for audit actors.
- Keep referencing equipment/site/profile UUIDs. `sites.assigned_engineer` and consumable requesters remain existing text fields; normalize them only with a planned, preserving migration when real role ownership is introduced.
- Categories currently disappear from choices when no equipment uses them. Introduce independent category records only when categories need metadata or their own lifecycle.
- Movement covers whole equipment entries. Partial bulk allocation needs its own quantity/accountability model.
- Legacy transfer/history rows are preserved but cannot have missing site/actor information invented or be advanced as managed workflows without an explicit migration.
- Standalone supplier invoices, financial purchase orders, file attachments, notification delivery, user provisioning and a complete audit of metadata edits remain future work; the UI does not pretend those services exist.
- QR tags continue to use the existing external QR image service. Self-hosted generation can remove that dependency later.

## File inventory

Generated from the final working tree below. No existing files were deleted; static markup and obsolete sample-data blocks were replaced in place.

### Modified files

- `css/layout.css`
- `index.html`
- `js/app.js`
- `js/data.js`
- `js/navigation.js`
- `modules/activity/activity.html`
- `modules/activity/activity.js`
- `modules/consumables/README.md`
- `modules/consumables/consumables.js`
- `modules/consumables/setup.sql`
- `modules/dashboard/dashboard.css`
- `modules/dashboard/dashboard.html`
- `modules/dashboard/dashboard.js`
- `modules/masterlist/masterlist.css`
- `modules/masterlist/masterlist.html`
- `modules/masterlist/masterlist.js`
- `modules/missing/missing.css`
- `modules/missing/missing.html`
- `modules/missing/missing.js`
- `modules/purchases/purchases.css`
- `modules/purchases/purchases.html`
- `modules/purchases/purchases.js`
- `modules/repairs/repairs.css`
- `modules/repairs/repairs.html`
- `modules/repairs/repairs.js`
- `modules/reports/reports.css`
- `modules/reports/reports.html`
- `modules/reports/reports.js`
- `modules/requests/requests.css`
- `modules/requests/requests.html`
- `modules/requests/requests.js`
- `modules/returns/returns.css`
- `modules/returns/returns.html`
- `modules/returns/returns.js`
- `modules/settings/settings.css`
- `modules/settings/settings.html`
- `modules/settings/settings.js`
- `modules/sites/README.md`
- `modules/sites/setup.sql`
- `modules/sites/sites.js`
- `modules/sites/tests/sites.browser.cjs`
- `modules/transfers/transfers.css`
- `modules/transfers/transfers.html`
- `modules/transfers/transfers.js`
- `modules/users/users.html`
- `modules/users/users.js`

### New files

- `PROJECT_REVIEW.md`
- `README.md`
- `css/movement.css`
- `database/movement.sql`
- `js/movement.js`
- `js/records.js`
- `js/services.js`
- `modules/masterlist/README.md`
- `modules/masterlist/tests/masterlist.browser.cjs`
- `modules/purchases/README.md`
- `modules/requests/README.md`
- `modules/requests/tests/movement.browser.cjs`
- `modules/requests/tests/movement.database.cjs`
- `modules/settings/setup.sql`
- `package.json`
- `tests/records.browser.cjs`
- `tests/run.cjs`
- `tests/settings.database.cjs`
- `tests/system.browser.cjs`

### Removed files

None.
