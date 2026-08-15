# ADR-0004 — Cloud-only Supabase development, no Docker

**Status:** Accepted (2026-06-04, Phase 0).

## Context

The standard Supabase workflow is `supabase start`: a local Postgres, GoTrue, PostgREST and Storage
in Docker. The development machine here is Windows with no Docker installed, and installing it was
not something the project wanted to require of everyone who touches the repo.

The alternatives were: install Docker and use the local stack; run against the production project
(unthinkable); or use a **second cloud project** as the development target.

## Decision

Development runs against a **separate cloud Supabase project**. `.env.development` points at it,
`supabase/config.toml` names it as the CLI default, and the production project is never the implicit
target of any command.

Two consequences of the CLI's Docker assumptions had to be worked around, and both are permanent
parts of the workflow:

- `supabase db push` needs a database URL. The direct `db.<ref>.supabase.co` host does not resolve
  over IPv4 from here, so the **session pooler** URL is used, with any `&` in the password
  URL-encoded as `%26`.
- `supabase gen types --local` (and `--db-url`) needs Docker. Types are generated with
  `--project-id <ref>` and a personal access token instead.

## Consequences

- There is no local database to seed or reset, so verification is done against a real project with
  throwaway users and workspaces that are deleted afterwards. That has repeatedly caught things a
  local stack would not have — RLS behaviour, an owner short-circuit, a dead project reference in
  `config.toml`.
- Anyone can clone and run the frontend with `npm install && npm run dev`, with no infrastructure.
- Applying a migration needs a token, so a session without one can write migrations but not apply
  them. Two are pending for exactly this reason; the state is written down rather than assumed.
- A destructive migration would hit shared data. Migrations are append-only and reviewed on that
  basis — see [the runbook](../runbooks/apply-a-migration.md).

## Where it lives

`supabase/config.toml`, `.env.development`, and the CLI at `F:\Movie\AK\FinRoot\.tools\supabase\`
(standalone binary — deliberately not a global npm install).
