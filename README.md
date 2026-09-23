# MCPA

Construction asset and accountability application using the existing HTML/CSS/JavaScript modules and Supabase. No build step or production framework was added.

Serve the project over HTTP with the existing VS Code Live Server configuration. Open `index.html`; use an existing Supabase account or the explicitly labeled public prototype workspace. The public workspace follows the project's existing anonymous database access. It does not grant an authenticated identity or an Admin role.

## Database setup

Use the existing project's Supabase SQL Editor. Run these files in order:

1. `modules/sites/setup.sql` — existing Sites setup and `equipment.site_id` relationship.
2. `modules/consumables/setup.sql` — existing consumables, purchase requests and stock ledger, if not already installed.
3. `database/movement.sql` — additive workflow fields, operations and history protection on the existing equipment transfer/history tables.
4. `modules/settings/setup.sql` — authenticated users can update only their own profile name.

These scripts preserve records and insert no sample business data. Masterlist requires no new category table: it uses the existing `equipment.category` field and `sites.id`. Appearance, start-page and table-size preferences need no SQL; they are saved in the browser.

The existing `equipment` and `profiles` tables are prerequisites. Their original creation migration was not present in this repository. Public REST inspection confirmed exposed columns and existing reference tables, but does not reveal all constraints/defaults/policies. The Movement migration checks incompatible required legacy columns and status enums and rolls back rather than silently changing them. Inspect the full schema in SQL Editor if it reports an incompatibility.

No live schema changes or live test writes were performed. The configured publishable key can perform permitted API operations, but cannot apply SQL migrations. Never put an administrative key in browser code.

Movement retains the existing public prototype access model. Its RPCs validate workflow states and commit equipment/history together; they do **not** implement role authorization. Direct transfer/history writes are revoked in favor of the RPCs. See [Movement access notes](modules/requests/README.md) before introducing production roles.

## Module lifecycle

Each script registers `window.MCPAModules[module]` once. The router mounts fresh HTML, calls `init({root, signal, isCurrent})`, and aborts/destroys the previous controller before leaving. Initialization can return a promise. Async callbacks must check the mount before changing the page; listeners and timers must be cleaned up on exit. Modules read current database records on re-entry.

Shared code is in `js/services.js` (public database client/preferences), `js/records.js` (read models and exports), and `js/movement.js` (equipment workflows). Keep authoritative operations and authorization in PostgreSQL/RPCs, not UI visibility rules.

## Verification

Requires Node 22+ and Chrome or Edge. Set `CHROME_PATH` if the browser is installed elsewhere. Install only the existing test dependencies:

```sh
npm ci --prefix modules/sites/tests
npm ci --prefix modules/consumables/tests
npm test
```

`npm run test:database` runs four isolated PostgreSQL suites. `npm run test:browser` runs six isolated Chrome suites. Tests use local mocks or PGlite PostgreSQL, block external browser requests and never write to the live Supabase project. Browser profiles/screenshots are saved to the OS temporary directory. Restricted environments may need permission to launch local Chrome.

The tests cover CRUD, repeated and overlapping navigation, reference dropdowns, quantity/date validation, database paging, failed saves, retry safety, transactional movement/stock operations, history protection, settings persistence, simulated authentication/session changes, text escaping, exports and mobile/dark layouts. Live account credentials, deployment-specific policies and external QR printing still need verification in the deployed environment.

See [the review report](PROJECT_REVIEW.md) for changes, root causes, file inventory and remaining work for future roles.
