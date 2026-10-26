# Engineer upgrade design documentation

This records an ordinary Operate-mode extension of the incumbent SiteTrace/MCPA interface. It does not establish a new visual world or replace the design system. `PRODUCT.md`, `DESIGN.md`, and `.impeccable/design.json` are preserved. No approved comp was supplied or needed for this extension; comparison uses the existing code, documented scope, final captures, and review evidence.

## Incumbent system comparison

`PRODUCT.md` requires the white, black, and gold identity, a bright default, optional dark mode, efficient field use, and role-controlled custody workflows. The request extension inherits the workspace's semantic tokens from `css/global.css` and `css/theme.css`: gold actions, warm light surfaces, near-black dark surfaces, muted supporting text, and semantic feedback. The quantity styles alias these incumbent tokens within their mount rather than introducing a replacement global palette. Public Sans remains the operational typeface; the page and authentication headings retain the established serif identity.

`DESIGN.md` and the schema-v2 design sidecar explicitly describe the login gallery only. Their charcoal palette, Fraunces/Public Sans pairing, photographic framing, and compact glass card apply to registration as an authentication surface. They are not normative workspace card or type scales. The completed extension preserves that separation: workspace requests retain light and dark themes; registration retains the supplied project photograph, mark, gallery controls on desktop, and compact photographic treatment.

## Finished extension

| Surface | Observed implementation and evidence |
| --- | --- |
| Quantity request, desktop | Available Equipment and Request Details are separate top-aligned cards with independent heights. The scoped creation grid uses two columns with a 24px gutter and `align-items:start`. Both cards use the existing semantic surface/border vocabulary with 12px corners. Selected equipment, stock breakdown, quantity, assigned project, purpose, review sentence, and submission are readable in both final desktop themes. |
| Quantity request, compact | At 900px and below the creation grid becomes one column. Scoped overrides remove the catalog height cap and internal scrolling, so the catalog and request details remain in document flow. Card padding reduces from 22px to 20px and then 16px at 480px. Both 390px full-page captures show complete stacked cards and the submission action without visible horizontal spill. This behavior is local to the equipment creation flow, not a global removal of scrolling from other queues or pickers. |
| Transfer destination | `composer.mjs` filters destination choices by the receiving custodian's assigned sites, clears an ineligible prior destination, and disables destination/submission when no eligible project exists. The final 390px capture shows a wrapping explanation below the select: the custodian has no active project and the user can choose another custodian or ask Admin to assign one. The retained transfer notes and disabled submit action are visible. Source associates the select with the helper using `aria-describedby`; the helper has `role="status"` and `aria-live="polite"`. |
| Admin invitations | The final capture shows the incumbent account table, pending invitation, resend/revoke controls, and a private-link panel with expiry guidance, copying, and dismissal. It explicitly says email delivery still requires configuration. Sampled `users.js` provides the invitation's person, name, email, authorized role and delivery controls, capability-based availability, and feedback. The expanded invitation form was not captured, so its visual layout is supported by source inspection only. |
| Recipient registration | Desktop and compact captures show full name, locked invited email, new password, confirmation, mismatch feedback, and Complete registration with no recipient role selector. `auth.js` renders the email readonly, resolves invitation identity before enabling registration, and keeps role assignment in the Admin workflow. Registration reuses the established login layout rather than extending its charcoal styling into the workspace. |

Quantity controls retain 44px minimum heights, visible focus outlines, muted helper text, disabled states, and reduced-motion handling in the sampled styles. These are source observations; this documentation pass did not exercise keyboard interaction or measure live computed contrast.

## Review and inherited findings

`design-review.md` initially returned `disposition: fix` for one material issue: the transfer destination explanation was clipped inside a disabled select. `design-verdict.md` subsequently scored that issue resolved and returned `disposition: ship`. That verdict applies to the single correction, not a fresh whole-product review. The final transfer capture and sampled source corroborate the correction.

The existing review classified 51 supplied detector findings: 20 type-size, 17 color, 10 radius, two overused-font, and two font-family findings. These counts are inherited review evidence; this pass did not rerun the detector. Many comparisons use the login-only `DESIGN.md` against workspace styles. Operational type sizes, 12px quantity cards, smaller controls/status radii, gold hover states, and semantic feedback are consistent with this extension and do not by themselves establish system drift. The inherited Inter/masterlist warnings concern other surfaces. No pre-existing drift or unrelated source was repaired, and the login-only design files were not broadened into an undocumented workspace specification.

## Evidence checked and limits

Read `PRODUCT.md`, `DESIGN.md`, the design sidecar's identity/scope, `design-review.md`, `design-verdict.md`, and the Impeccable document reference. Compared the finished extension with `css/global.css`, `css/theme.css`, and these implementation files:

- `js/upgrades/quantity-requests/styles.css`
- `2-engr/modules/quantity-requests-v2/index.js`
- `js/upgrades/equipment-requests/unified.css`
- `js/upgrades/custody-lifecycle/composer.mjs`
- `js/auth.js`
- `1-admin/modules/users/users.js`

Opened all eight final evidence images under `.impeccable/review/final/`:

- `upgrade-request-desktop-light.png`
- `upgrade-request-desktop-dark.png`
- `upgrade-request-mobile-light.png`
- `upgrade-request-mobile-dark.png`
- `upgrade-transfer-empty-mobile.png`
- `upgrade-admin-invitation.png`
- `upgrade-registration-desktop.png`
- `upgrade-registration-mobile.png`

No browser was run, no product source was edited, and no tests were independently rerun in this documentation pass. Captures and source demonstrate the reviewed presentation and UI behavior, not real invitation delivery, successful live Auth registration, backend authorization, database security, or deployment. Sample identities, stock, projects, and the synthetic private-link result are evidence fixtures, not verified operational records. The existing product document's prototype/security caveat remains; this work does not resolve it or claim production readiness.
