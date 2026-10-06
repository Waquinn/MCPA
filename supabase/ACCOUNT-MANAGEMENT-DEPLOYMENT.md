# People & Accountability deployment

Local implementation prepared on 2026-10-06. Live progress is recorded only where
the owner has supplied verification results. The owner confirmed `manage-accounts`
deployed successfully; authenticated runtime behavior remains unverified.
The owner confirmed custom SMTP is disabled and domain purchase is out of scope.
Use the free development account path below; SMTP is not a development prerequisite.
Stop at each gate; do not publish the new frontend before the backend is ready.

## Current manual gate — confirm GitHub Pages publishing source

Owner-provided live results confirm both prerequisite migrations succeeded:

- Legacy handover tables have RLS enabled; browser table/column access and legacy
  RPC execution are revoked.
- `profile_id_auth_fk_present` is false. The profile primary key and the
  `auth_user_id` foreign key with `ON DELETE SET NULL` remain.
- All eight incoming equipment/history/transfer/movement/site foreign keys remain.
- MCPA Administrator and MCPA Test Engineer remain active, with their original
  profile IDs and Auth links; each still has `same_uuid: true`.

These changes were applied by the owner and verified from their supplied SQL
results. The agent has not executed live migrations.

The owner's `Account Management.csv` confirms account-management deployment:

- Both account tables have RLS enabled and no anonymous access.
- Authenticated users have no direct write privileges on either table.
- The invitation table has no authenticated SELECT grant. Audit SELECT is granted
  but its policy restricts rows to active Admins.
- `mcpa_invitation_step` is executable by service_role, not anon/authenticated.
- Account list/save RPCs are executable by authenticated, not anon; their function
  bodies enforce active Admin authorization.
- Both existing accounts retain their IDs, links, roles and active status.

The owner's `Supabase Snippet Untitled query (2).csv` confirms the recipient
migration is installed with all definition and permission checks below matching.

The owner confirmed GitHub Pages at `https://waquinn.github.io/MCPA/` and saved
the Auth URL values in Gate 3. The production invitation implementation is retained.

The owner's `Supabase Snippet Untitled query (3).csv` confirms the development
account migration: RLS enabled, all browser table/column/RPC access false,
`service_role_execute` and `invitation_rpc_service_only` true, and the existing
Admin and Engineer identities, Auth links, roles and active status unchanged.
No migration rerun is needed. This verification does not establish live test users.

The owner confirmed saving `MCPA_SUPABASE_SECRET_KEY`, `MCPA_APP_URL`,
`MCPA_ENABLE_DEVELOPMENT_ACCOUNTS=true` and `MCPA_EMAIL_INVITATIONS_ENABLED=false`.
`MCPA_DEV_ORIGINS` remains unset. No secret values were read or printed by the agent.
Runtime access to these values is not yet verified.

The owner confirmed successful CLI login.

The owner supplied the successful deployment output for `manage-accounts` on
project `zpqxlmiqwevhlstjirei`, including both `index.ts` and `handler.mjs` uploads.
Deployment is confirmed; runtime authorization and capabilities are not yet tested.

**Next manual action only:** open the GitHub repository's Settings → Pages and
report the publishing Source and branch/folder when shown. The local branch is
`Updated-MCPARole` and there is no checked-in `.github` workflow establishing the
Pages publishing target. Confirm that target before giving publish commands.
Frontend publication and live test-account creation remain pending.

The earlier recipient migration updates the movement functions to select recipients by profile UUID,
bind requests to the signed-in person's profile ID, and include project context
in the recipient list. It preserves the active-account/role checks, named-recipient
receipt check, pending-state and unchanged-custody checks, and mandatory inspection
and testing. Applying the SQL does not move equipment or rewrite existing records.

The updated frontend sends `receiverId`. Older frontend versions that send only a
recipient name cannot create transfers after this migration. Coordinate this gate
with use of the updated frontend; avoid creating transfers from older app tabs.
Existing pending transfers remain receivable by their stored recipient IDs.

Confirmed from the supplied recipient verification:

- `receiver_lookup_uses_profile_id`: true.
- `legacy_receiver_name_lookup_present`: false.
- `receipt_matches_authenticated_profile`: true.
- `recipient_project_context_present`: true.
- Anonymous execution is false for all listed movement RPCs.
- Authenticated execution is true for public action/snapshot RPCs, false for the
  private transaction function.
- Both existing accounts retain their active status, original IDs and links.

These definition/permission checks confirm installation; they do not replace the
later live two-Engineer transfer test. Both account-management and recipient
migrations and Edge Function deployment are now confirmed from owner-provided
results. Real Engineer A/B account creation and live transfer validation remain
pending until the updated frontend is published and runtime checks pass.

## Gate 1 — read-only live preflight

In the existing Supabase project's SQL Editor, run `supabase/preflight.sql`.
Review the column, constraint, trigger, policy, grant and function results privately.
No service keys, passwords or tokens are needed in the output.

Also run:

```sql
select id, name, role, account_status, auth_user_id
from public.profiles
where id in ('b28645de-d763-4cd8-91a3-68c31b7d03a5',
             '9c31f387-788d-4ff5-9a87-96d13a394fe3');
select conname, pg_get_constraintdef(oid)
from pg_constraint where conrelid='public.profiles'::regclass;
select name, count(*) from public.profiles group by name having count(*) > 1;
select id, name from public.profiles
where auth_user_id is not null and role is null;
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname='public';
```

Confirm the two existing accounts retain their current IDs and links. Inspect
Auth-user creation triggers: an automatic `profiles.id = auth.users.id` insertion
can create a second person when an existing historical person is invited. Do not
silently disable or replace such a trigger. Stop and review its definition first.
Compare the live movement RPC definitions with the repository before replacing
them if any changes were made directly in SQL Editor.

## Gate 2 — apply the two additive migrations

**Completed:** legacy lockdown, independent identity, account-management database
support and recipient identity are confirmed from owner-provided results. The
following migration order is retained for reference; no rerun is needed at this gate.

After preflight review and a database backup, run these files in order in SQL Editor:

1. `supabase/migrations/202610060001_account_management.sql`
2. `supabase/migrations/202610060002_recipient_identity.sql`

The first adds invitation/audit tables and guarded RPCs. It does not change the
profile identity columns, seed accounts or rewrite any IDs. The second replaces
the movement functions to accept `receiverId` and retains existing transaction
validation. Existing persisted transfers continue to use their existing receiver
IDs. Both files are transactional and repeatable. Do not rerun older migrations
or prototype setup scripts afterward; they would restore obsolete behavior.

The old frontend cannot create transfers once migration 2 requires `receiverId`.
Schedule the frontend update with backend deployment and avoid active transfers
during that short release window. Existing pending receipts remain supported.

## Gate 3 — Auth URLs confirmed; email delivery deferred

The owner saved these values in Authentication → URL Configuration:

- Site URL: `https://waquinn.github.io/MCPA/`
- Redirect URL: `https://waquinn.github.io/MCPA/`
- Redirect URL: `https://waquinn.github.io/MCPA/?account_setup=invite`
- Redirect URL: `https://waquinn.github.io/MCPA/index.html` (password recovery).
- Retain existing exact local-development entries; confirm host/port before adding any.

Keep public signup disabled. Development accounts use server-side Auth Admin
`createUser` with `email_confirm: true`, with no invitation or confirmation email.
That confirms only these explicitly created test accounts; global email confirmation
and public signup settings are not relaxed.

For future production invitations, configure a verified SMTP sender under Auth
email settings. The default email service has recipient/rate restrictions; use real
mailboxes for live invitation validation. Keep the invitation/recovery templates'
`{{ .ConfirmationURL }}` links (the current frontend handles Supabase's session
fragment redirect). A custom `token_hash` template needs its own callback handler
and is not assumed by this implementation. Email-scanner consumption and expired
links should be checked with the real mail provider.

## Gate 4 — secrets and Edge Function deployment

The function uses only these server environment variables:

- `SUPABASE_URL`: supplied by Supabase's hosted Edge runtime.
- `MCPA_SUPABASE_SECRET_KEY`: the existing project's server secret (`sb_secret_...`).
- `MCPA_APP_URL`: `https://waquinn.github.io/MCPA/` (preserve the trailing slash).
- `MCPA_ENABLE_DEVELOPMENT_ACCOUNTS`: `true` for the current development deployment.
  Defaults to disabled unless exactly `true`. Set `false` to disable creation later.
- `MCPA_EMAIL_INVITATIONS_ENABLED`: `false` until SMTP and templates are configured.
  This is an operator-controlled readiness flag, not automatic SMTP discovery.
  Set `true` only when email delivery is ready; no People & Accountability redesign
  is required. Existing invitation RPCs and authorization are unchanged.
- Optional `MCPA_DEV_ORIGINS`: comma-separated exact localhost/127.0.0.1 origins
  with their actual ports, only when local browser testing is needed. Omit for now.
  Only loopback origins are accepted and only when development creation is enabled.

Set the MCPA values in the Dashboard's Edge Functions → Secrets. Never put secrets in
frontend JS or send the secret through chat. The chosen app URL also determines
the GitHub Pages browser origin and the invitation redirect. Browser capabilities
are returned only after verifying an active Admin; they contain flags and pending
job summaries, never credentials. The UI fails closed if that request cannot load.

With Supabase CLI installed and authenticated, deploy from the repository root:

```powershell
npx.cmd supabase functions deploy manage-accounts --project-ref zpqxlmiqwevhlstjirei --use-api
```

Deploy both files in `supabase/functions/manage-accounts/`. The function verifies
the caller with `auth.getUser(token)`, checks the active Admin profile, and the
service-only RPC rechecks it for every step. Gateway JWT verification remains on.
If a request is rejected by the gateway, inspect project JWT configuration and
function logs before changing authentication settings; do not disable checks just
to clear an error. Check that the pinned npm import resolves in the deployed runtime.

## Gate 5 — frontend and live validation

Publish the updated static assets using the existing hosting workflow. Do not
serve `.env`, `scripts`, `.git`, `.agents`, tests or private deployment files.

1. Sign in as the existing Admin. Verify the existing Admin and Test Engineer IDs.
2. Confirm invitations show "not yet configured" and the invitation controls are
   disabled. Open **Development / Testing Only**. Create **MCPA Development Engineer A**
   and **MCPA Development Engineer B** as documented in `TEST-ACCOUNTS.md`. Use
   private, distinct temporary passwords and keep them privately. These are real
   Auth accounts with active profiles; no email is sent and no Offline Demo is used.
3. Check login, refresh, logout, Admin-only creation, role restrictions and audit
   history. Follow the live A → B custody test in `TEST-ACCOUNTS.md`.
4. Deactivate test accounts using Edit access when done. Disabling the creation
   flag does not deactivate existing accounts; historical records must be preserved.

After SMTP is configured and the invitation flag is enabled, additionally:

1. Invite a new Engineer using a real inbox. Verify email receipt, password setup,
   normal login, refresh, logout and password recovery.
2. Invite an existing unlinked historical person. Confirm the same profile ID and
   historical custody references remain. Repeat with two people sharing a name.
3. Resend an unaccepted invitation after at least one minute. The label is based on
   Auth's `invited_at` and `email_confirmed_at`, not inferred from profile status.
4. Test inactive-account denial, non-Admin function rejection, role edits, and audit
   visibility. A retained Auth session alone must not permit business RPCs.

The local suites simulate Auth/SMTP, execute SQL/RLS with PGlite, and run browser
checks. They do not prove deployed Edge runtime behavior or real email delivery.

Local verification commands:

```powershell
npm.cmd test --prefix tests
npm.cmd test --prefix scripts
```

The browser suite additionally covers the invitation form, password setup across
reload, recovery, expired callbacks, all five roles and inspected receipt. Handler
integration tests cover email acceptance followed by interrupted profile linking.
Chrome's debugging interface may require running outside the filesystem sandbox;
these tests block external browser requests and do not use the root `.env`.

## Interrupted development account creation

Development jobs reserve name/email/role without storing passwords or creating
spare company profiles. Auth users receive immutable-to-user `app_metadata` job
markers. After Auth creation succeeds, the SQL finish step verifies the marker,
email and confirmed status before atomically creating one independent profile,
linking it and recording the acting Admin in the audit log.

If the request fails or the connection drops, retry the same details and original
password. Pending jobs remain visible after refresh. Auth creation that already
succeeded is reconciled without changing that password or sending email. Another
person's existing email, invitation or profile cannot be adopted. Unknown failures
return sanitized messages, and passwords are cleared from the form after submission.
They are never stored in application tables, browser storage or returned responses.
Accounts are temporary by intended use, not automatic expiry; deactivate after testing.

## Interrupted invitations and recovery

The database reserves one invitation per email/person before calling Auth. A failed
send leaves an inactive unlinked person and a visible **Retry invitation** action.
Retry reuses that identity. A successful email followed by interrupted linking can
be reconciled from the same job, including if the email was already accepted.
An in-flight attempt has a two-minute lease; resends have a one-minute cooldown.
Network uncertainty can result in another email, but never intentionally another
company identity. Auth/Supabase logs help distinguish accepted mail from delivery.

For an Auth account that predates the invitation workflow, select its unlinked
company profile under **Advanced / Recovery Account Linking** and enter the verified
Auth UUID. Existing links cannot be reassigned or removed there. Changing an email,
deleting a person, moving an account between people, and creating another Admin are
outside this workflow. Prepared invitations cannot be retargeted to another email;
resolve a mistaken identity deliberately, preserving the audit trail.

References: [Supabase invitations](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail),
[email templates](https://supabase.com/docs/guides/auth/auth-email-templates),
[Edge authentication](https://supabase.com/docs/guides/functions/auth).

