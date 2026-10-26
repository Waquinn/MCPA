# Connect to a different Supabase project

The application is static HTML/JavaScript. Browsers cannot read `.env` directly.
Every module now uses one shared client, configured by the generated
`js/supabase-config.js` file. There is no fallback to the old database.

1. Put the new project's values in the root `.env`:

   ```dotenv
   SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR-PUBLIC-KEY
   SUPABASE_SECRET_KEY=YOUR-PRIVATE-SERVER-KEY
   ```

   A legacy `SUPABASE_ANON_KEY` is also supported. The secret key is optional for
   the browser and is used only by trusted administrative scripts and schema checks.
2. With Node.js 22+, run `npm.cmd start` from the project root, then open
   `http://127.0.0.1:5502`. This server regenerates public configuration on refresh
   and excludes private files. No dependency installation is required.
3. If using VS Code Live Server instead, run `npm.cmd run configure` after each
   `.env` change, then refresh the page. Existing shell environment variables
   override `.env`; remove stale shell overrides if the reported project is wrong.
4. Run `npm.cmd run check:database` for a read-only connection and core schema check.
5. Exit offline demo if active, refresh, and sign in with an account from the new
   project. Supabase sessions are scoped to each project; old accounts/sessions do
   not transfer automatically.

For static hosting, run `npm.cmd run configure` during deployment and include the
generated `js/supabase-config.js` with the public application assets. Never deploy
`.env`, `.env.example`, `.git`, `scripts`, or private documentation. The generated
file contains only the project URL and public key and is ignored by Git.

Changing the connection does not copy data or install migrations. If API objects
are missing, inspect the target database first and follow
`supabase/migrations/README.md`; these historical migrations must not be replayed
as a batch.

Supabase documents the public/server key distinction in its
[API key guide](https://supabase.com/docs/guides/getting-started/api-keys).
