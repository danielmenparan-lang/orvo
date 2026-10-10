// Supabase Dashboard → Project Settings → API
window.SUPABASE_URL = 'https://lbfysqtnarhkoqcnaivg.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiZnlzcXRuYXJoa29xY25haXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDk1MDUsImV4cCI6MjA5NzEyNTUwNX0.-FX1UJpHfTnMZZD5YoOW_J8Ram5Ts7ndd1VQyJM57xY';

// Marketplace take rate on custom quote jobs (Launch SKUs are fixed-price, fee baked in)
window.ORVO_FEE_PERCENT = 12;

// Stripe — paste Payment Link URLs after creating products (see docs/path-to-10k-mrr.md)
// Leave empty → UI shows "connect Stripe" CTA; quote accept stays manual until set.
window.STRIPE_PAYMENT_LINK = ''; // fallback for marketplace quote accepts

window.STRIPE_LINKS = {
  // One-time — ORVO Agent Launch
  launch_lite: '', // $1,490
  launch_pro: '',  // $3,490  ← default hero SKU
  launch_plus: '', // $6,990
  // Recurring — ORVO Run
  run_basic: '',   // $299/mo
  run_pro: '',     // $699/mo
  run_team: '',    // $1,499/mo
};

// Your email = ORVO admin (approve builders in Dashboard → Review builders)
window.ORVO_ADMIN_EMAIL = 'danielmen.paran@gmail.com';
