---
name: sunx-connectors
description: "Use when adding Sunx OAuth connectors, tool manifests, secret storage, allowlists, or runtime tool proxies. Triggers: Shopify, HubSpot, Gmail, Slack, Sheets, Nango, Composio, connector consent, SSRF."
---

# Sunx Connectors Skill

## Principles
- OAuth redirect + explicit scope approval
- Secrets in vault/encrypted secret_ref only
- Tool manifest declares connector + mode (`read`|`draft_write`|`write`)
- Runtime authz: consent + tool policy + allowlist
- HTTP tools: block private IPs / metadata endpoints (SSRF)

## v1 order
1. Google Sheets or HubSpot (read)
2. Slack (post to channel with draft/approve if risky)
3. Shopify (order read; refund draft only)

## Adapter interface
`connect`, `refresh`, `revoke`, `callTool(name, input, ctx)`

Prefer Nango/Composio for OAuth lifecycle; keep adapters swappable.
