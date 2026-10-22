# Manual migration gate

This directory is a historical SQL source archive, not an approved chronological
deployment queue for the current production project. It contains original and
scoped compatibility implementations for different reviewed live states.

For the current split Storage deployment, **do not execute
`202610100003_feature_storage.sql`** and do not blindly run `supabase db push`,
`migration up`, a wildcard SQL runner, or a full historical replay. Equipment Photos
is already installed by `202610210001_equipment_photo_compatibility.sql`, including
its intentional equipment-only DELETE cleanup policy. The old combined migration
does not recognize that policy and its global immutability check is inapplicable.

Use the explicit dependency order in
[purchase receipt deployment](../../documentation/purchase-receipts-2026-10-23/DEPLOYMENT.md).
The new **202610230001 receipt-only** migration must precede the earlier-dated
**202610100005 purchase ledger** and **202610220000/001/002 Consumables** migrations.
Do not infer order from filenames for this manual deployment.

No automatic deployment workflow was found in this repository. Future automation
must first establish a separately reviewed baseline against actual live catalog
and migration-history results. Do not invent an "applied" history row for the old
combined migration merely to suppress it: only the photo compatibility migration's
objects are installed, not that migration's complete semantics. Do not mark it
applied, repaired, rolled back, or otherwise alter migration history automatically.
Keep an operator deployment log identifying which exact compatibility scripts
were actually executed. Any future history reconciliation is a separate reviewed
operation; these instructions do not authorize it.

The original Storage SQL remains unchanged for provenance. Its presence here is
not permission to apply it. The new receipt migration fails closed on existing
receipt artifacts and unexpected browser policies rather than overwriting them.
