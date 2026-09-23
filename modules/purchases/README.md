# Purchases

This screen manages the existing consumable purchase requests and stock receipts.
It uses `consumable_requests`, `consumables`, and `consumable_stock_movements` from
`modules/consumables/setup.sql`; it creates no additional tables.

Create requests, receive partial or full deliveries, and cancel an outstanding
balance through the same validated transactional RPCs used by Consumables.
The shared `CR-00001` reference identifies the same request on both screens.
Receipt operation IDs are retained when a save response fails, so retrying cannot
add the same receipt to stock twice. Database versions prevent stale updates.

The original supplier, price, receipt-upload and tool-purchase fields had no
database storage or handlers. They are no longer presented as working controls.
Financial purchase orders and document attachments require an approved schema
and storage policy; equipment acquisitions remain in Masterlist.

Requests and receipts reload on every module visit. Search, status filters,
pagination, CSV export, required fields, quantity limits, and save failures are
covered by `tests/records.browser.cjs`. Its receipt and cancellation scenarios
run against the real setup SQL in isolated PGlite, with external HTTPS blocked.
