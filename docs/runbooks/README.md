# Runbooks

Procedures for things that are done rarely, under pressure, or with consequences — written so the
next person does not have to reconstruct them from migration files at the wrong moment.

| Runbook | When |
|---|---|
| [apply-a-migration.md](apply-a-migration.md) | A migration is written and needs to reach the database |
| [deploy.md](deploy.md) | Shipping the frontend or an edge function |
| [workspace-deletion-and-restore.md](workspace-deletion-and-restore.md) | A workspace is deleted, restored, or its 30 days run out |
| [account-deletion.md](account-deletion.md) | Someone asks to have their account erased (DPDP / GDPR) |
| [declare-an-incident.md](declare-an-incident.md) | Something is broken and users need to be told |
| [rotate-credentials.md](rotate-credentials.md) | A key leaked, a token expired, or one is simply overdue |

## Conventions

- **A runbook states its own honesty first.** If a step depends on something not yet built, it says
  so at the top rather than in the middle. Several here do.
- **Commands are the ones actually used**, including the Windows-specific parts. This project runs
  the Supabase CLI as a standalone binary and has no Docker
  ([ADR-0004](../adr/0004-cloud-only-supabase-dev.md)); nothing here assumes otherwise.
- **Every destructive step names what it destroys** before the command that does it.
- Substitute your own values for `<ref>`, `<tenant-uuid>` and so on. No secret is written down in
  this directory — see [rotate-credentials.md](rotate-credentials.md) for where they live.
