#!/usr/bin/env bash
# ORVO founder setup — print ordered steps (run from repo root).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPLY_URL="https://raw.githubusercontent.com/danielmenparan-lang/orvo/cursor/orvo-local-site-3bd5/sql/APPLY-ALL-001-020.sql"

cat <<EOF
═══════════════════════════════════════════════════════════════
  ORVO Founder Setup (ordered)
═══════════════════════════════════════════════════════════════

1. DATABASE (Supabase SQL Editor)
   • Open: ${APPLY_URL}
   • Paste entire file → Run once
   • Or: sql/APPLY-ALL-001-020.sql from repo

2. SIGN UP on site once, then admin SQL:
   update public.profiles set is_admin = true
   where email = 'your@email.com';

3. VERIFY in app
   • Sign in → Profile → Setup health → Re-check
   • Schema should be 10/10

4. STRIPE SECRETS
   cp scripts/edge-secrets.template.sh scripts/edge-secrets.local.sh
   # edit with STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, service role
   bash scripts/edge-secrets.local.sh

5. DEPLOY EDGE FUNCTIONS
   bash scripts/deploy-stripe.sh
   bash scripts/verify-edge.sh    # quick 401/501 probe

6. STRIPE DASHBOARD
   • Webhook → https://<project>.supabase.co/functions/v1/stripe-webhook
   • Events: checkout.session.completed, account.updated, charge.dispute.created

7. SMOKE TEST (test mode)
   See: docs/payments/STRIPE-SMOKE-TEST.md
   Card: 4242 4242 4242 4242

8. GO LIVE (only after smoke passes)
   • supabase-config.js → ORVO_CHECKOUT_LIVE = true
   • Redeploy Netlify

Checklist UI: file://${ROOT}/founder-checklist.html
Full docs: docs/payments/STRIPE-DEPLOY-CHECKLIST.md
EOF
