# People & Accountability deployment

Local implementation prepared on 2026-10-06. Live progress is recorded only where
the owner has supplied verification results. Edge Functions/SMTP remain unverified.
Stop at each gate; do not publish the new frontend before the backend is ready.

## Current manual gate — confirm the deployed login URL

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

**Next manual action only:** provide the exact HTTPS URL used to open the deployed
MCPA login page. If the application is only running locally, report that instead.
The repository does not establish a deployed login URL. Confirm it before changing
Auth URL configuration or setting `MCPA_APP_URL`.

This updates the movement functions to select transfer recipients by profile UUID,
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
migrations are now confirmed from owner-provided results. Edge Function deployment
and live invitation testing remain on hold pending the remaining configuration gates.

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

## Gate 3 — Auth URL and email configuration

Choose the actual HTTPS login URL, for example `https://YOUR-HOST/index.html`.
In Authentication → URL Configuration:

- Set Site URL to that login URL.
- Add that exact URL and `https://YOUR-HOST/index.html?account_setup=invite` to Redirect URLs.
- Add the actual second portal login URL only if it is used.

Keep public signup disabled. Configure a verified SMTP sender under Auth email
settings. The default email service has recipient/rate restrictions; use real
mailboxes for live invitation validation. Keep the invitation/recovery templates'
`{{ .ConfirmationURL }}` links (the current frontend handles Supabase's session
fragment redirect). A custom `token_hash` template needs its own callback handler
and is not assumed by this implementation. Email-scanner consumption and expired
links should be checked with the real mail provider.

## Gate 4 — secrets and Edge Function deployment

The function uses only these server environment variables:

- `SUPABASE_URL`: supplied by Supabase's hosted Edge runtime.
- `MCPA_SUPABASE_SECRET_KEY`: the existing project's server secret (`sb_secret_...`).
- `MCPA_APP_URL`: the exact HTTPS login URL from Gate 3, without a query or fragment.

Set the last two in the Dashboard's Edge Functions → Secrets. Never put them in
frontend JS or send the secret through chat. The chosen app URL also determines
the single allowed browser origin and the invitation redirect.

With Supabase CLI installed and authenticated, deploy from the repository root:

```powershell
supabase functions deploy manage-accounts --project-ref zpqxlmiqwevhlstjirei
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
2. Invite a new Engineer using a real inbox. Verify email receipt, password setup,
   normal login, refresh, logout and password recovery.
3. Invite an existing unlinked historical person. Confirm the same profile ID and
   historical custody references remain. Repeat with two people sharing a name.
4. Resend an unaccepted invitation after at least one minute. The label is based on
   Auth's `invited_at` and `email_confirmed_at`, not inferred from profile status.
5. Test inactive-account denial, non-Admin function rejection, role edits, and audit
   visibility. A retained Auth session alone must not permit business RPCs.
6. Follow the two-Engineer custody test in `TEST-ACCOUNTS.md` using test equipment.

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

