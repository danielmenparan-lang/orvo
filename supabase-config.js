// Supabase Dashboard → Project Settings → API
window.SUPABASE_URL = 'https://lbfysqtnarhkoqcnaivg.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiZnlzcXRuYXJoa29xY25haXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDk1MDUsImV4cCI6MjA5NzEyNTUwNX0.-FX1UJpHfTnMZZD5YoOW_J8Ram5Ts7ndd1VQyJM57xY';

// Founding fee display (Accept & pay sheet). Authoritative fee lives in Edge env when Checkout ships.
window.ORVO_FEE_PERCENT = 0;

// Display currency for money() — settlement stays USD until multi-currency Checkout.
// Set to 'ILS' only for local he-IL formatting experiments (see docs/i18n-RTL-PREP.md).
window.ORVO_DISPLAY_CURRENCY = 'USD';

// Deprecated — ignore. Use Checkout Session (docs/payments/STRIPE-CONNECT-MVP.md), not Payment Links.
window.STRIPE_PAYMENT_LINK = '';

// Your email = ORVO admin (approve builders in Dashboard → Review builders)
window.ORVO_ADMIN_EMAIL = 'danielmen.paran@gmail.com';
