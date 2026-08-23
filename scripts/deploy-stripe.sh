#!/usr/bin/env bash
# Deploy ORVO Stripe Edge Functions to linked Supabase project.
# Prereqs: Supabase CLI installed + `supabase link --project-ref <ref>`
# Secrets: set per docs/payments/STRIPE-DEPLOY-CHECKLIST.md before going live.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found. Install: https://supabase.com/docs/guides/cli"
  exit 1
fi

echo "Deploying ORVO Edge Functions…"
supabase functions deploy create-checkout-session
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy create-connect-account
supabase functions deploy release-to-builder

echo ""
echo "Done. Next:"
echo "  1. Set Edge secrets (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, SITE_URL)"
echo "  2. Profile → Setup health → Re-check (Edge rows should show deployed)"
echo "  3. Smoke test Checkout → webhook → held/funded"
echo "  4. Flip ORVO_CHECKOUT_LIVE=true in supabase-config.js after smoke passes"
echo "See docs/payments/STRIPE-DEPLOY-CHECKLIST.md"
