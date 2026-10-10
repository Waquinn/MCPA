# Engineer / Architect portal update

Prepared locally. This work does not apply a live migration, deploy the frontend,
or alter live accounts, projects, custody, requests, handovers or history.

## Findings and compatibility

- Projects crashed because `assignedToMe(site)` read `project.assigned_engineer_id`.
  Its loading flag was marked successful before rendering completed.
- Engineer Projects now uses `mcpa_project_snapshot()`, which returns only assigned
  projects, actual accountable profile names, permitted equipment and project history.
  Admin-only project controls are removed from the Engineer/Architect DOM. Existing
  Admin-only database write policies remain in force.
- Personal Equipment Tracking calls only `mcpa_personal_equipment_snapshot()`.
  Tools are filtered by authenticated `profiles.id = equipment.current_holder_id`
  on the server, with relevant authorized movement history. Requests continue to
  use the existing separate authorized catalog through `mcpa_movement_snapshot()`.
- A project has **one** accountable profile (`sites.assigned_engineer_id`). There is
  no project membership relation. One person can be accountable for multiple projects.
  Based on the supplied screenshot, Engineer B currently has no receiving project.
  Admin must assign B an active receiving project. To preserve A's accountability
  for MCPA Development Transfer Test, use a separate project for B. Supporting both
  at that project would require a separately reviewed membership model; this update
  does not silently replace A or invent membership.

## Backend migration

Review `migrations/202610100001_engineer_portal.sql` after the existing account
management migrations. Apply **only this new migration**, once, using the SQL Editor;
do not rerun original setup scripts. It is transactional and leaves existing data
and IDs unchanged. The final verification should report both snapshots present and
both anonymous QR access and authenticated private-function access false.

The new APIs and private QR reference table are additive. The existing movement RPC
remains public with its original signature; its authorized implementation is moved
behind a new wrapper. The wrapper adds an active recipient/project-assignment check
for **new direct transfers**, including manual entry. It keeps original custody,
reservation, idempotency, recipient receipt and inspection rules. Already-created
transfers can still be received under their existing rules. A valid repeat of a saved
operation can return its original result even after the receiving QR expires.

Receiving QR references contain two random UUIDs encoded as a 64-character opaque
value. Only its SHA-256 hash is stored in the private table. References expire after
15 minutes, can be revoked by their receiver, and generating a new one revokes older
ones for that receiver. They may assist multiple transfers while valid; they never
confer custody or receipt authorization. Resolution and submission recheck the active
receiver and current active project assignment. Raw QR tokens are stripped from the
movement operation payload before it reaches stored operation/audit history.

## Frontend and live validation gates

After reviewing the migration result, deploy the frontend through the existing
GitHub Pages branch/root workflow at https://waquinn.github.io/MCPA/.
No new Edge Function, SMTP provider, secret or custom domain is required.
The existing QR generator is reused; the existing html5-qrcode scanner is pinned to
2.3.8 and loaded in both HTML entry pages. Camera capture needs HTTPS or localhost.

Engineer B's receiving-project assignment is an Admin prerequisite, not a task for
an automated migration. The receiving QR and the existing TRF handover code have
different controls and payloads. Confirm B can generate a QR, A can scan it and the
verified receiver/project appears. **Stop before creating a live transfer** until the
live handover test is explicitly authorized. Preserve T-1204 and all existing records.

Then test camera permission denial, close/navigation cleanup, expiry and revocation
on actual phones. Browser automation models scanner callbacks and camera lifecycle;
it does not validate optical scanning or real iOS/Android hardware permissions.

## Local validation

From the repository root:

```
node --test tests/engineer-portal.database.cjs
node tests/auth.browser.cjs --portal
```

These use an isolated local PostgreSQL fixture with authenticated roles and RLS;
browser HTTPS requests are blocked. Fixtures test issue/resolve/revoke/expiry,
assignment changes, inactive accounts, forbidden RPCs and project writes, manual
transfer validation, operation retries, unchanged custody on scan/dispatch, named
receiver inspection/receipt, personal/project scopes, modal draft protection and
camera cleanup. Responsive UI checks cover 393px, 430px and 1440px in the existing
themes. No real passwords, Auth accounts or live movement data are used.
