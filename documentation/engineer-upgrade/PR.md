Engineer request methods now use an Admin-configured, non-overlapping catalog: standard tools are requested by quantity, while designated equipment is selected by Asset ID. Quantity availability includes pending demand and existing reservation/custody safeguards, and the form uses separate desktop cards with a stacked mobile layout.

The change also restricts retirement details to Admins, reuses lifecycle-managed automatic synchronization, validates transfer destinations against the receiving custodian's current project assignment, and adds Admin invitation issuance/revocation plus guarded recipient registration. New invited profiles remain inactive until trusted registration completes; no recipient role selection or elevated-Admin provisioning is introduced.

Validation: 65 automated checks and engineer-upgrade, combined-custody/materials, and unified-request browser flows passed against isolated local PostgreSQL/PGlite and synthetic Auth transport. Desktop/mobile and both workspace themes were reviewed. Real SMTP, hosted GoTrue links, Edge deployment and multi-connection Staging contention remain unverified.

Two additive migrations and the `manage-accounts` deployment/configuration are prepared only. Production baseline and Pages build were verified at `5ad129f`. Roland's My Consumables and unrelated QA changes remain separate; QA's invitation-removal migration requires explicit reconciliation.

See [implementation, test evidence, configuration, deployment order and rollback](documentation/engineer-upgrade/IMPLEMENTATION.md). **Draft for review and Staging validation. Do not merge, apply Production SQL, or deploy without separate approval.**
