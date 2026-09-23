# Masterlist

Masterlist uses the shared module lifecycle in `js/app.js`. Its script registers
`MCPAModules.masterlist`; `init(context)` reads equipment and sites for each mount,
and `destroy()` aborts reads and removes listeners. The original second-visit bug
was caused by reinjecting a classic script containing global `let`/`const`
declarations. JavaScript rejected those redeclarations before the module could
render. The original refresh path also accumulated checkbox listeners.

## Existing database references

Read-only inspection of the configured Supabase API confirmed `equipment.id`,
`equipment.asset_id`, `equipment.category`, and `equipment.site_id`, plus
`sites.id/name` and the existing `equipment_history` table. The public key cannot
read the complete OpenAPI schema. `categories`, `equipment_categories`, and
`asset_categories` were absent from the exposed schema.

- Equipment mutations address its UUID `id`; generated asset tags use a UUID
  instead of the original collision-prone four-digit random number.
- The site form, site filter, and bulk assignment use `sites.id` and display
  `sites.name`. Unassigned equipment remains unassigned. No site name is copied
  into an equipment record. The old code read/wrote a nonexistent `site` column.
- Categories reuse existing `equipment.category` text. Choices come from current
  records; the form can create a new category with the item. A separate category
  table is unnecessary until categories need independent metadata or lifecycle.
  A category disappears from choices when no equipment uses it.
- Both reference selectors refresh whenever a form opens. Opening Masterlist
  also reads current data again. Reads continue through API pages even if the
  server returns fewer rows than requested.
- The profile shows real history for that equipment, most recent 20 entries.
  The previous fabricated movement entry and nonfunctional photo upload were
  removed. QR rendering continues to use the existing external QR image service.

No Masterlist schema changes are required. Apply the existing Sites setup for
`site_id`; `database/movement.sql` adds movement conflict and historical deletion
protection. Masterlist reports those conflicts and preserves the entered form.
Editing also matches the original assignment/status/quantity, preventing a stale
editor from overwriting equipment after a movement completes. Bulk assignment is
an intentional update of the selected records' current assignment; the movement
trigger blocks it while any selected equipment has an open workflow.

## Verification

Run `node modules/masterlist/tests/masterlist.browser.cjs` with Node 22+ and Chrome
or Edge. `CHROME_PATH` can select a browser. The standalone test server replaces
Supabase with a local mock and blocks HTTPS; it performs no live database writes.

The suite covers repeated navigation, escaped category/history display, actual
site IDs, new sites appearing in forms, search/filter/pagination, status aliases,
CRUD, stale-edit protection, new categories, zero stock, duplicate submissions,
bulk edits, capped API paging, persisted page size, failed reads and recovery,
movement conflicts, blocked popups, mobile layout, and stale navigation responses.
Temporary browser profiles and a mobile screenshot are printed by the runner.
