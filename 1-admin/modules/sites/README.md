# Projects module

Projects manages records in the unchanged Supabase `sites` table and reads
equipment linked by the unchanged `site_id` field. Projects are archived instead
of deleted; equipment assignments and historical references are retained.

## Database setup

1. Run the current `setup.sql` in this project's Supabase SQL Editor. It creates `sites`,
   adds the nullable `equipment.site_id` foreign key and index, enables row-level
   security, and adds validation and an update timestamp trigger. It does not
   insert sample records, assign existing equipment, or change equipment policies.
2. The setup grants Projects select/insert/update to `anon` and `authenticated`,
   with matching row-level policies. The current app's Sign In button only reveals
   the UI and does not establish a Supabase session, so it uses `anon`. This means
   site CRUD is public to callers of this project's API, matching the current
   prototype. RLS remains enabled, and equipment policies remain unchanged.
   When the app adopts real authentication, replace these public policies with
   the intended user/role restrictions. See [Supabase's RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).
3. Run [realtime-archive.sql](realtime-archive.sql) after `setup.sql`. It adds and
   backfills `is_active`, synchronizes it with the legacy `archived_at` field,
   revokes browser deletion, and adds `equipment` and `sites` to the existing
   Supabase Realtime publication. It preserves other published tables.
4. Open Projects. Records update through Realtime, with automatic checks every
   30 seconds and on reconnect/tab focus. Use Add Project for new records.
   Archive writes `is_active: false`; Restore writes `true`. Active dashboard
   projects are queried with `.eq('is_active', true)`.

The migration is supplied for the Supabase SQL Editor; it has not been applied
to the live project by this frontend change. See [frontend update notes](../../../FRONTEND-UPDATES.md)
for the availability rule, code locations, and current focused tests.

### If Add Site reports a permission error after the original setup

Rerun the **updated `setup.sql`**. The original script granted writes only to
`authenticated`, while the app sends `anon` requests. Changing a browser API key
or reloading cannot fix that database permission mismatch.

The updated setup is repeatable: it preserves existing records and assignments,
replaces only this module's trigger/policies/date constraint, and repairs the
grants for create, edit and delete. It also aligns inventory dates with Manila
time so a valid date is not rejected around midnight. `prototype-access.sql`
remains a repeatable permissions-only repair for older installations; it is not
a second required step after the updated setup.

The configured public key can access application data, but cannot execute the
schema setup. Run the SQL through the project's SQL Editor with administrative
database access. Never add a secret or service-role key to the frontend.

## Equipment and movement

- Inventory joins equipment to sites by `equipment.site_id`, so renaming a site
  preserves its assignments. Unassigned equipment is not attributed to a default
  site. The current live equipment table had no location column when inspected.
- Actual assignments must populate `equipment.site_id` from the future
  assignment/movement workflow or an authorized database import. This module does
  not assign, transfer, create, edit, or delete equipment.
- Counts sum quantities rather than record counts. The inventory hides zero
  quantities; Review Assigned Tools includes those records. Missing and disposed
  quantities remain visible, and both repair statuses count as Repair.
- Holders resolve `current_holder_id` against `profiles.id` and display `profiles.name`.
  If a profile is inaccessible or absent, the stored ID remains visible. Unassigned
  holders display a dash.
- A site with any linked equipment cannot be deleted, including zero-quantity
  equipment. Both the UI and a restrictive foreign key enforce this.
- `repository.movements(siteId, equipmentId)` now reads confirmed transfers and
  returns from the [movement workflow](../movements/README.md). Source and
  destination IDs retain history after site renames and after equipment leaves.
  The movement schema restricts deletion of historically referenced sites.
  Engineer and demo views are read-only; demo inventory comes from browser data.

## Verification

Run `node modules/sites/tests/sites.browser.cjs` with Node 22+ and Chrome or Edge.
Set `CHROME_PATH` if the browser is installed elsewhere. Tests use a temporary
browser profile and a local mock Supabase client, with all external requests
blocked; they never write to the live project.

Checks cover CRUD, persistence across reloads, duplicate/blank validation,
concurrent edits, failed saves, deletion protection, pagination, equipment search
and details, module reloads, escaped content, read-only movement, and mobile/dark
mode, interrupted loads, server pagination limits, and retaining review filters.
Temporary screenshot paths are printed by the runner.

Database regression tests execute the actual SQL using local PostgreSQL (PGlite):

```sh
npm ci --prefix modules/sites/tests
node modules/sites/tests/sites.database.cjs
```

They reproduce the original permission failure, rerun the setup on existing
records, and test CRUD as both `anon` and `authenticated`, row-level security,
duplicate/invalid data, Manila dates, stale writes, and restrictive deletion.
The test dependency is confined to the test folder, not loaded by the application.
Run both suites with `npm test --prefix modules/sites/tests`. Neither suite writes
to the live Supabase project. The SQL must still be applied in its SQL Editor.
