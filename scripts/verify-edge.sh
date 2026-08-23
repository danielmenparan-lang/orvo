#!/usr/bin/env bash
# Quick Edge function reachability check (401/501 = deployed).
BASE="${SUPABASE_URL:-https://lbfysqtnarhkoqcnaivg.supabase.co}"
KEY="${SUPABASE_ANON_KEY:-}"

if [[ -z "$KEY" && -f supabase-config.js ]]; then
  KEY=$(grep -oP "SUPABASE_ANON_KEY = '\K[^']+" supabase-config.js 2>/dev/null || true)
fi

echo "Probing $BASE/functions/v1/ …"
for fn in create-checkout-session stripe-webhook create-connect-account release-to-builder; do
  hdr=(-H "content-type: application/json")
  [[ -n "$KEY" ]] && hdr+=(-H "apikey: $KEY")
  code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/functions/v1/$fn" "${hdr[@]}" -d '{}' --connect-timeout 8 2>/dev/null || echo "000")
  code=${code:0:3}
  case "$code" in
    404) hint="NOT DEPLOYED — run bash scripts/deploy-stripe.sh" ;;
    401|400|405|501) hint="deployed (secrets may be pending)" ;;
    000) hint="unreachable (network/DNS)" ;;
    *) hint="HTTP $code" ;;
  esac
  echo "  $fn → $code ($hint)"
done
echo ""
echo "Full setup: bash scripts/founder-setup.sh"
