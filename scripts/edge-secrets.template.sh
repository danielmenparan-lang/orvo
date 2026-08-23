#!/usr/bin/env bash
# Template: set Supabase Edge Function secrets for ORVO Stripe path.
# Copy to edge-secrets.local.sh, fill values, run once. Do NOT commit secrets.
#
# Usage:
#   cp scripts/edge-secrets.template.sh scripts/edge-secrets.local.sh
#   # edit scripts/edge-secrets.local.sh
#   bash scripts/edge-secrets.local.sh
set -euo pipefail

: "${STRIPE_SECRET_KEY:?Set STRIPE_SECRET_KEY (sk_test_… or sk_live_…)}"
: "${STRIPE_WEBHOOK_SECRET:?Set STRIPE_WEBHOOK_SECRET (whsec_…)}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY}"
: "${SUPABASE_URL:?Set SUPABASE_URL (https://xxx.supabase.co)}"

SITE_URL="${SITE_URL:-https://fantastic-eclair-0b2c66.netlify.app}"
ORVO_FEE_PERCENT="${ORVO_FEE_PERCENT:-0}"

if ! command -v supabase >/dev/null 2>&1; then
  echo "Supabase CLI not found."
  exit 1
fi

echo "Setting Edge secrets (project must be linked)…"
supabase secrets set \
  STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  SUPABASE_URL="$SUPABASE_URL" \
  SITE_URL="$SITE_URL" \
  ORVO_FEE_PERCENT="$ORVO_FEE_PERCENT"

echo "Done. Deploy functions: bash scripts/deploy-stripe.sh"
echo "Then Profile → Setup health → Re-check → smoke Checkout."
