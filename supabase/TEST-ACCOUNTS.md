# Real development accounts

**The credentials below are seed inputs, not proof that accounts exist.** They work only after `node scripts/seed-test-users.mjs` completes successfully against the same Supabase project used by the browser. A `400 invalid_credentials` response from `/auth/v1/token` means Auth rejected the login; check that the account exists under Authentication → Users and rerun the trusted seed script to restore its password. Profile/RLS changes cannot fix a rejected password login.

These accounts use Supabase Auth and live database records. They are separate from **Try offline demo**. Use only in a development project; rerunning the script restores the listed passwords and active roles.

## Setup (PowerShell, repository root)

1. Follow [AUTH-DEPLOYMENT.md](AUTH-DEPLOYMENT.md): run preflight and apply the existing `202610040001_authenticated_access.sql` migration in the project's SQL Editor. The seed script does not apply SQL or disable RLS. Review existing triggers and policies as described there.
2. In the Supabase development project's **Connect** dialog obtain the Project URL. Under **Settings → API Keys**, obtain a server secret key (`sb_secret_...`). Put it in `SUPABASE_SECRET_KEY` below. The script does not require the legacy `SUPABASE_SERVICE_ROLE_KEY` variable. Never use the publishable/anon key for account administration. See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).
3. Create `.env` in the repository root (copy `.env.example` if it does not already exist):

   ```dotenv
   SUPABASE_URL=https://YOUR-DEVELOPMENT-PROJECT.supabase.co
   SUPABASE_SECRET_KEY=YOUR-PRIVATE-SERVER-KEY
   ```

   `.env` is ignored by Git. Never paste this key into chat, frontend code, localStorage or committed files. Do not serve the repository root with an unrestricted file server: exclude `.env`, `scripts`, `.git` and other private files from hosting. The browser continues using its existing public key. Use the same project as the browser configuration in `js/equipment-tracking.js` and `js/movement-cloud.js`.
4. With Node 22+ installed, run:

   ```powershell
   npm.cmd ci --prefix scripts
   node scripts/seed-test-users.mjs
   ```

   The package installed is `@supabase/supabase-js` v2, locked in `scripts/package-lock.json`. Native Node environment loading requires no dotenv package. Environment variables already set in the shell take precedence over `.env`.
5. Open the existing app, exit Offline Demo if necessary, and sign in manually:

   | Account | Email | Development password |
   |---|---|---|
   | Admin | admin.demo@mcpa.test | MCPA-Admin-2026! |
   | Engineer | engineer.demo@mcpa.test | MCPA-Engineer-2026! |

Emails are confirmed through the Admin API; no mailbox is required. Passwords are sent only to Auth, never to profiles. Architect has the same operational routes, actions and database permissions as Engineer, so a third account is unnecessary.

## Profile identity and repeat runs

The existing schema uses `profiles.name` and `profiles.auth_user_id = auth.users.id`. New profiles also receive `id = auth.users.id`. An already linked historical profile retains its existing ID, preserving custody and audit references. No matching by display name, duplicate profile system, or role metadata is introduced. Existing creation timestamps/defaults are preserved; `updated_at` is refreshed. The script paginates Auth users, reuses email matches, confirms email, resets the development password, and ensures the intended role/status.

If creation succeeds but profile setup fails, the command exits nonzero; fix the reported prerequisite and rerun. It will reuse the Auth account. Run one seeding invocation at a time. Do not delete historical profiles to resolve conflicts.

## Verify real sessions

- Admin: confirm Admin dashboard/navigation, People & Accountability and review controls. Borrower quick actions must be absent.
- Admin: assign a development project to **MCPA Test Engineer** in Projects. Seeding does not reassign existing company projects or create equipment. Without project assignment, the Engineer cannot submit requests for that project.
- Engineer: confirm operational dashboard, request available test equipment for the assigned project, then have Admin approve/release. Confirm receipt as Engineer, test transfer/return and issue reporting using test equipment. Live actions change real records.
- Engineer: `#users` and `#reports` must be blocked. Raw full inventory/profile access must remain restricted; operational snapshots supply scoped records.
- Refresh each signed-in browser: Supabase's persistent session should restore the database profile and correct dashboard. Log out, then refresh/back: protected UI must stay hidden.
- Check browser console/network for errors, and verify Offline Demo remains separate and makes no live data requests.

Local verification: `npm.cmd run test:auth --prefix tests` uses simulated Auth transport and actual local PostgreSQL/RLS; it does not prove real Auth login, SMTP delivery or live policy deployment.

Verification on 2026-10-05: both seed unit tests and the local database authorization test passed. The browser suite passed outside the sandbox after sandboxed Chrome debugging timed out: all five roles, Admin review/release, Engineer tested receipt/return, session restoration/logout, direct route guards and offline isolation. No live accounts were created during this verification because the root `.env` was unavailable. No SQL migration or policy changes were added by the seed implementation.

Latest live verification on 2026-10-05, after the project owner applied the migration: **both accounts were created successfully** using `node scripts/seed-test-users.mjs`. Email confirmation, exact names, active roles, and `profiles.id = profiles.auth_user_id = auth.users.id` were verified for each account.

| Account | Auth/profile UUID | Result |
|---|---|---|
| Admin | b28645de-d763-4cd8-91a3-68c31b7d03a5 | Real login, profile RPC, live snapshot and account-management access passed |
| Engineer | 9c31f387-788d-4ff5-9a87-96d13a394fe3 | Real login, profile RPC and live snapshot passed; account management and raw full inventory access restricted |

Real Chrome checks also passed for both accounts: existing login form, correct dashboard, persistent session on refresh, logout and signed-out refresh. Admin had no borrower quick actions; Engineer's Admin route was blocked. No uncaught JavaScript errors occurred. The browser used the public key and real Supabase SDK, with no mocked Auth or database. No live business transactions were submitted. Engineer currently has no assigned project; assign a development project before testing requests.

To repeat the live browser check (requires Chrome or `CHROME_PATH`):

```powershell
node scripts/verify-test-login.browser.cjs
```

This explicit live check signs in/out and reads authorized data; it does not load `.env`, use a server key, or modify equipment/project records.

Forgot password already calls Supabase and handles password recovery. Delivery still depends on project SMTP/redirect configuration. These `.test` addresses have no mailbox, so rerun the seed script to reset their passwords.
