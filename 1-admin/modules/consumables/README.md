# Consumables module

## Supabase setup

1. Open the Supabase project already configured in Masterlist and Sites.
2. Paste **all of [setup.sql](setup.sql)** into its SQL Editor and run it once.
3. Serve the application over HTTP (for example, the existing VS Code Live Server),
   open Consumables, and click **Refresh**.
4. Use **Add Consumable** to enter real materials, units, opening quantities, and
   minimum levels. The script starts empty; the old illustrative rows are not
   imported as actual stock.

The script is repeatable and preserves existing Consumables records. It creates
three tables, their constraints/indexes, five database functions, and the module's
access policies. It does not need the Sites setup or modify equipment, sites,
profiles, other modules' policies, or other purchase/request tables. No extensions,
Realtime configuration, or additional browser dependencies are required.

The SQL must be run in the SQL Editor; the public browser key cannot install a
database schema. The application continues using the existing shared Supabase
client and public project configuration. Do not put a secret key in the frontend.

## How it works

| Action | Result |
| --- | --- |
| Add Consumable | Saves name, unit, minimum and opening stock, including an opening ledger entry. |
| Edit | Changes the name/minimum. Units are fixed to keep historical quantities meaningful. |
| Update Stock | Records usage, restocking without a request, or a corrected physical count. A reason/reference is required. |
| Purchase Required / Request Stock | Opens a request for that item; suggests the shortage, with an editable quantity. |
| + Purchase Request | Selects any item without an open request. Creates one item per request. |
| View Request / View | Shows its reference, quantities, requester, purpose, dates and status. |
| Receive Stock | Records a full or partial delivery, increases stock, and saves its delivery history in one transaction. |
| Cancel | Requires a reason; closes the outstanding requirement while keeping received stock/history. |
| History | Shows actual opening stock, usage, restocking, corrections and request receipts. |
| Refresh / filters / search | Reloads actual records, or filters the loaded inventory/request list. |

- **Out of Stock** means zero stock, even when the minimum is zero. **Low Stock**
  means positive stock below the minimum. Stock equal to the minimum is **OK**.
  The database computes this status; the banner counts all affected items,
  independent of the current search/filter, and indicates existing open requests.
- Requests start **Pending**, then become **Partially Received** or **Received**.
  A pending or partial request can be **Cancelled**. Creating/cancelling a request
  does not change stock. A partial cancellation retains quantities already received.
- One open request per consumable is enforced by the database, including requests
  submitted from another browser. Closed requests remain available in the filters.
- Quantities allow three decimal places, from zero to 999,999,999.999; usage,
  restocking and request/receipt quantities must be positive. Usage cannot exceed
  available stock. A receipt cannot exceed the request's outstanding amount.
- Automatic checks run every 30 seconds while this module is visible. Checks pause
  while a dialog is open or a save is running, and are cleaned up on navigation.
  Notifications are in the Consumables banner; no email, push notification, or
  shared Dashboard/bell integration is added in this module-only change.
- Failed saves preserve form values. Retry the same form after a lost response:
  stable operation IDs prevent a repeated receipt/stock change from applying twice.
  A stale-record conflict requires closing the form and refreshing. When a save
  succeeds but reloading fails, the screen explicitly reports that it was saved
  and disables changes until Refresh succeeds.
- Dates use Manila time. Needed-by dates are optional and cannot be in the past
  when creating a request. Existing overdue requests remain visible.

## System analysis and scope

The existing application is a plain HTML/CSS/JavaScript shell. `loadModule` fetches
each screen, replaces its markup and reruns its script on each visit. Consumables
therefore uses a closure, scoped listeners/styles and disposable polling, without
adding shared globals other than reusing the existing database client.

Masterlist stores assets in `equipment`; Sites stores project metadata and reads
assigned equipment. The `equipment` workflow has no consumable minimum-stock or
request model. Requests is a static tool-release mockup; Purchases is a static
purchase-record mockup. Dashboard, movement, activity, reports, users and settings
also have static records. The original Consumables button merely navigated to
Purchases without saving a request, and its fixed seven-item warning contradicted
the four low-stock rows displayed.

This implementation owns consumable balances and replenishment requests inside
Consumables. It does not infer balances from Masterlist or duplicate/migrate
equipment records. Purchase approval, supplier invoices/receipts, and tool-release
workflows remain outside this module. Request names/units are saved as historical
snapshots, so renaming a material preserves the original request details.

### Access model

The existing **Sign In button only reveals the UI**; it does not authenticate with
Supabase. Following the established Sites setup, `anon` and `authenticated` can
read all Consumables records and invoke its five validated functions. Anyone who
has the public API configuration has these capabilities. Requester names are user
entered, not verified identities; this module does not introduce role approval.

RLS is enabled. Direct table inserts/updates/deletes are denied to browser roles;
writes go through limited `SECURITY DEFINER` functions with an empty `search_path`,
qualified table names and explicit execute grants. This protects stock/history
consistency but does **not** provide user-level authorization. When real login is
implemented, replace anonymous read/function grants and add the intended role
checks inside these functions as well as the read policies. See Supabase's
[function security](https://supabase.com/docs/guides/database/functions) and
[row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Verification

Use Node 22+ and Chrome/Edge. On PowerShell, use `npm.cmd` if `npm.ps1` is blocked.

```sh
npm ci --prefix modules/consumables/tests
npm test --prefix modules/consumables/tests
```

The dependency is test-only. Database tests execute the shipped SQL in an isolated
PostgreSQL engine (PGlite). Browser tests serve the real application and route SDK
calls to that same SQL implementation; HTTPS resources are blocked and there are
no live Supabase writes. Set `CHROME_PATH` to a Chrome/Edge executable if needed.
The runner prints temporary screenshot/profile paths for inspection.

Tests cover validation, repeated setup, both access roles, immutable history,
duplicate open requests, partial/full receipts, over-receipt and negative-stock
prevention, retry safety, transactional rollback, stale updates, cancellation,
search/filtering, setup and connection failures, pagination under a small server
cap, escaping, navigation/reloads, timer cleanup, keyboard dismissal and mobile
layout. Live Supabase connectivity still needs verification after applying SQL.
