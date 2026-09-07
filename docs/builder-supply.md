# ORVO — Builder supply (cold start)

Without approved builders, marketplace fees stay at $0. Fill supply first.

## Target founding roster

See `data/founding-roles.json` — **20 seats** across WhatsApp, Voice, Automation, RAG, full-stack.

## What shipped

| Piece | URL / file |
|-------|------------|
| Recruiting page + directory | `builders.html` |
| Ready agent catalog | `agents.html` + `data/ready-agents.json` |
| Stronger apply (+ invite code) | Dashboard → Apply |
| Admin invite codes | Dashboard → Invite codes |
| Public directory toggle | Profile (approved builders) |
| SQL | `sql/builder-supply.sql` |

## Your playbook this week

1. Run `sql/revenue-engine.sql` then `sql/builder-supply.sql` in Supabase
2. Sign in as admin → **Invite codes** → create 3–5 codes (max uses 5–10)
3. Send `builders.html?invite=CODE` to people who can ship agents
4. Approve applicants → they appear on the public directory
5. Share `agents.html` so clients request seeded jobs builders can quote

## Success metric

Not revenue yet — **10 approved builders who can quote within 48 hours**.
