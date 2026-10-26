disposition: fix

Inputs: This is a code-led extension of the incumbent interface; no approved comp or separate QUALITY BAR card was supplied. Review uses the supplied scope, PRODUCT.md, login-specific DESIGN.md, screenshots, named source files, detector findings, and craft floor. No browser was run.

## persistence

Pass. PRODUCT.md and DESIGN.md exist. DESIGN.md explicitly limits its charcoal/gallery system to authentication and preserves workspace light/dark themes. The reviewed request UI inherits workspace tokens; registration inherits the existing photographic login. This narrow extension does not require a concept roll, comp state, or replacement identity.

All eight required captures exist and were opened: upgrade-request-desktop-light.png, upgrade-request-desktop-dark.png, upgrade-request-mobile-light.png, upgrade-request-mobile-dark.png, upgrade-transfer-empty-mobile.png, upgrade-admin-invitation.png, upgrade-registration-desktop.png, and upgrade-registration-mobile.png. They show the named surfaces from the document top without blank or half-loaded regions. Mobile request captures are full-page 390px-width captures. The invitation capture documents the private-link result, not the expanded invitation form.

## fidelity

| Element / promise | Result | Evidence |
| --- | --- | --- |
| TYPE | match | Workspace headings, compact operational body type, and login Fraunces/Public Sans treatment remain coherent with the incumbent surfaces. |
| MATERIAL | match | Workspace uses restrained flat surfaces; registration retains the real project photograph and incumbent compact glass treatment. No invented material simulation. |
| GROUND | match | Request captures preserve the bright warm-neutral workspace and its near-black dark variant with gold actions. Registration stays within the login-specific charcoal world. |
| Independent desktop request cards | match | Both desktop captures show Available Equipment and Request Details as separate aligned cards with a clear gutter and independent heights. Source uses a two-column grid with align-items:start. |
| Mobile stacked request flow | match | Both mobile captures show full-width cards in document flow, complete form controls and submission action, and no visible horizontal spill. The scoped catalog override removes its height cap and internal overflow. |
| Selected equipment and task clarity | match | Selected type, stock breakdown, quantity, site, purpose and review sentence remain readable in both themes. |
| Transfer destination empty state | contradicted | upgrade-transfer-empty-mobile.png clips the only explanation inside the disabled destination select. composer.mjs:15 provides no wrapping explanation or recovery instruction, so the required clear empty state is incomplete. |
| Admin invitation | match at supplied scope | The capture shows pending invitation state, resend/revoke controls, private-link expiry and copying, and an explicit statement that email delivery still requires configuration. Sampled users.js supplies named invitation fields, capability-aware delivery and action feedback. Expanded-form appearance was not captured. |
| Recipient registration | match | Both registration captures show full name, invited email, new password, confirmation, a clear mismatch message and registration action with no recipient role picker. auth.js makes the invited email readonly and resolves invitation identity before enabling submission. |

Detector classification: the 51 supplied findings comprise 20 type-size, 17 color, 10 radius, two overused-font and two font-family findings. Most compare workspace styling against a DESIGN.md that governs login only; they do not establish workspace drift. The scoped quantity styles contain intentional operational type sizes, 12px card radii, small status/control radii, gold hover and semantic feedback colors. Those are compatible with the supplied extension direction. The Inter/masterlist warnings are outside these reviewed additions. No unrelated redesign is warranted by this detector output.

## ceiling

Reached for the supplied Operate-mode extension except for the destination-state explanation below. The incumbent gold, hierarchy, quiet card boundaries and photographic authentication identity carry the appropriate finish. Extra decorative motion, materials or a new identity would not advance the task. Hover/focus/loading behaviors were assessed in sampled source; the provided regression result is parent-reported, not independently rerun here.

## material_fixes

1. In js/upgrades/custody-lifecycle/composer.mjs updateDestinations/render, add a wrapping helper immediately below Destination site / project when the recipient has no eligible site: explain that this custodian has no active project and instruct the user to choose another custodian or ask Admin to assign one. Keep the short disabled-select label, associate the helper with aria-describedby, and expose changes through a polite status region. Preserve the transfer draft and existing disabled submission behavior. At 390px the complete reason and recovery must be visible without opening the select; this resolves the clear-empty-state contract.

## keep

Preserve independent desktop cards, naturally stacked mobile flow without catalog scrolling, both workspace themes, gold actions, locked invited email, confirmation feedback and the existing login gallery. This review covers the supplied captures and sampled UI source; it makes no claim about real invitation delivery, live authentication, database security or production deployment.
