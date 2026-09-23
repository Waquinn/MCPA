# Equipment Movement

Requests, Transfers, Returns, Repairs and Missing Tools use the shared
`js/movement.js` controller and the existing equipment, sites, profiles,
equipment_transfers and equipment_history tables. Every module mount fetches
fresh records. Controllers dispose their listeners and ignore late responses
after navigation.

Apply `database/movement.sql` after `modules/sites/setup.sql` using the Supabase
SQL editor. The public browser key cannot apply schema changes. The SQL is
additive and rerunnable; it preserves original transfer `status` values and
legacy rows, adds a separate `workflow_status`, and appends real history events.
Legacy records remain visible but cannot be advanced through the new workflow
without an explicit migration of their original meaning.

The inspected public API exposes column names but not full constraints or enum
definitions. Validate the migration against the deployment's full schema before
applying it. No migration or test was run against the live database.

## Behavior

- Requests reserve an available equipment entry while pending. Approval and
  release are recorded before receipt updates its site and holder.
- Transfers preserve the current assignment until receipt is confirmed.
- Returns clear the holder and save the receiving site and condition. Damaged
  returns create a repair case in the same transaction. Lost items must be
  reported through Missing; the return operation rejects loss and preserves custody.
- Repair completion restores availability or the retained holder's assignment;
  disposal retains the equipment and its history.
- Reporting missing preserves the last site and holder. Recovery restores the
  retained assignment (or repair status when that was the prior state).
- Each workflow covers the equipment entry's entire quantity. Partial movement
  of bulk entries needs a future allocation model; the interface says so.
- Holders must reference real profiles. An empty profiles table prevents requests
  from inventing a recipient. Transfers can use site custody without a holder.

The two RPCs lock equipment and workflow rows, reject invalid/stale transitions,
prevent conflicting open workflows, and save equipment changes and audit history
atomically. Client generated operation IDs make create retries idempotent.
Equipment with history cannot be deleted. Direct equipment assignment/status
changes are blocked while a managed workflow is open.

## Access and future roles

The SQL follows the existing public prototype access model: `anon` and
`authenticated` can read records and execute validated operations, while direct
workflow/history writes are revoked. This is not role authorization. Signed-in
actors are recorded with `auth.uid()`; prototype actors remain null. Add explicit
role, site, recipient and approval checks to these RPCs and RLS before deploying
Engineer access. No Engineer role or fake upload/accountability controls were
implemented.

## Tests

Using the existing PGlite test dependency:

```sh
npm ci --prefix modules/consumables/tests
node modules/requests/tests/movement.database.cjs
node modules/requests/tests/movement.browser.cjs
```

The database suite covers migration preservation/reruns, workflow transitions,
atomic failure rollback, stale writes, invalid inputs, idempotency, history and
relationship protection, and both prototype/authenticated grants. The browser
suite uses Chrome/Edge, the real router/modules and the actual SQL in local
PostgreSQL. It tests all five workflows, revisits/reload, errors/retries, duplicate
submission, references, text escaping, search/filtering and mobile dark layout.
External browser requests are blocked; these suites never write live data.
