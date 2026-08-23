# 01 — Chief Product Judge: ORVO

**Product:** ORVO — AI Agent Marketplace  
**Surfaces reviewed:** `/workspace/index.html`, `/workspace/app.js`, `/workspace/supabase-config.js`  
**Live:** https://fantastic-eclair-0b2c66.netlify.app/ (HTML/JS match workspace as of review)  
**Model claimed:** Client posts need → vetted builders quote → private chat → pay via Stripe  

---

## 1. Verdict (פסק דין)

**Not a marketplace yet. A polished funnel shell over a half-wired CRUD app.**

The landing sells three guarantees — *vetted builders*, *private chat*, *secure Stripe payments*. Only the first has a real (manual) loop. Chat exists but trust enforcement is client-side theater. Payments are a `confirm()` dialog that can mark a job `funded` with **zero money moved** (`STRIPE_PAYMENT_LINK = ''`, `ORVO_FEE_PERCENT = 0`).

Versus Upwork / ServedByAI: ORVO has the *story* of a niche agent marketplace and almost none of the *machinery* (escrow, Connect payouts, disputes, reviews, searchable supply, notifications, legal). Shipping this publicly with “Secure payments — via Stripe” on the trust strip is a **product integrity failure**, not a minor stub.

**Ship bar:** Stop marketing payment security until Stripe Checkout/Connect + webhook truth exists. Keep invite-only / waitlist until that + RLS-backed admin and server-side chat rules land. The core loop (post → apply → approve → quote → chat) is demable; monetization and trust are not.

---

## 2. Bugs & product mistakes

### P0 — break trust or money

| # | Issue | Where |
|---|--------|--------|
| P0-1 | **Fake payment = funded.** Empty Stripe link → `confirm()` → insert `payments` with `status: 'paid'`, request → `funded`, quote → `paid`. No card, no webhook, no amount binding. | `app.js` `acceptQuote` ~881–909; `supabase-config.js` L8 `STRIPE_PAYMENT_LINK = ''` |
| P0-2 | **Marketing lies about Stripe.** Trust strip + How-it-works step 03 promise “Secure payments / Pay via Stripe / Builder gets paid when the job is done.” None of release/escrow/payout exists. | `index.html` L197–201, L209–210; no complete/release UI in `app.js` |
| P0-3 | **Admin identity is client-hardcoded email.** Anyone who knows `ORVO_ADMIN_EMAIL` knows the admin account; Profile UI prints the configured admin email; non-admin Admin view tells you which email to use. | `supabase-config.js` L11; `app.js` L24, L30–33, L162–167, L684, L912–928 |
| P0-4 | **Client self-promotes `is_admin` when email matches.** `loadProfile` updates `profiles.is_admin = true` from the browser. If RLS allows that update (common misconfig), privilege escalation is trivial. | `app.js` L234–245 |
| P0-5 | **Chat off-platform rules are frontend-only.** `validateChatMessage` runs in `sendMsg` only; **admins bypass**; raw Supabase inserts skip filters. Bypass = WhatsApp/PayPal/email in DB. | `app.js` L84–159, L832–840 |
| P0-6 | **Stripe Payment Link path still broken even when set.** Opens a generic link; payment row stays `pending`; no session_id / quote_id / webhook → never becomes paid automatically. | `app.js` L885–903 |

### P1 — broken core flows / serious UX lies

| # | Issue | Where |
|---|--------|--------|
| P1-1 | **Login overrides role routing.** `doLogin` → `routeAfterAuth(postSignupIntent)` after `openDash()` already routed by role. Default intent `client` sends **approved builders** to `go('requests')` (empty “My requests”) instead of jobs. | `app.js` L337–341, L392–394, L413–421 |
| P1-2 | **Builders can Message any open job without a quote / relationship.** Spam + early off-platform pressure; Threads also lists all open jobs for builders. | `app.js` L561–565, L861–865 |
| P1-3 | **No job lifecycle past “funded”.** No deliver, approve, release, dispute, or builder payout. Claim “paid when done” is false. | Entire `app.js` — statuses used: `open` / `in_progress` / `funded` only |
| P1-4 | **Accept quote does not close competing quotes** or prevent double-accept / re-pay. | `acceptQuote` ~881–909 |
| P1-5 | **Phone filter false positives.** Any message with 9–15 digits blocked after stripping money-ish patterns — order IDs, SKUs, n8n IDs, Hebrew/intl formats still messy. | `app.js` `chatHasPhone` L129–137 |
| P1-6 | **Post has no title field.** Title = first 80 chars of description — ugly cards, bad search later. | `app.js` `doPost` L498–500; modal `index.html` L285–290 |
| P1-7 | **Client request card → Chat** even with zero quotes — empty chat + “Waiting for quotes” only if owner; confusing entry. | `app.js` L522–531 |
| P1-8 | **Dual role impossible.** Sidebar is admin XOR builder XOR pending XOR client. Approved builders cannot manage their own client requests in-nav. | `app.js` `renderSidebar` L430–456 |
| P1-9 | **Auth: product tells users to disable email confirm.** Login error copy: turn OFF Confirm email in Supabase — anti-pattern for a paid marketplace. | `app.js` L387–388 |
| P1-10 | **No password reset / magic link / OAuth** in UI. Lockout = support ticket to founder Gmail. | Auth modal `index.html` L246–276 |

### P2 — polish, integrity, maintainability

| # | Issue | Where |
|---|--------|--------|
| P2-1 | Hero doubles CTAs: primary buttons **and** role cards = same actions; clutter. | `index.html` L172–185 |
| P2-2 | Hero “preview” is a static fake job card, not live inventory — marketplace looks empty by design. | `index.html` L187–194 |
| P2-3 | Footer `© 2025` (review date 2026). | `index.html` L237 |
| P2-4 | Quote floor `$1` (`cents < 100`) — unserious for custom agents. | `app.js` L575 |
| P2-5 | Fee percent live = `0`; fee UI only appears if non-zero — no monetization signal. | `supabase-config.js` L5; `acceptQuote` L884–889 |
| P2-6 | Profile “Status check” dumps debug/admin config to end users. | `app.js` L918–931 |
| P2-7 | Errors tell users to run `sql-*.sql` files not in this repo — ops debt on the critical path. | Multiple `bootErr` / empty states in `app.js` |
| P2-8 | No Terms, Privacy, Acceptable Use, or fee disclosure links. | `index.html` footer L236–243 |
| P2-9 | Inter + warm `#F9F9F7` + terracotta `#FF6B35` — generic “AI landing” look; brand signal weak once nav removed (eyebrow ≠ brand). | `index.html` L8–13, L169–170 |
| P2-10 | Chat polls every 4s **and** realtime subscribe — noisy; still no read receipts / unread counts. | `app.js` L807–811 |
| P2-11 | `money()` drops cents (`maximumFractionDigits: 0`) — fine for whole dollars, wrong if cents matter. | `app.js` L42–44 |
| P2-12 | Builder application LinkedIn optional; vetting has no portfolio review UI beyond text dump. | Admin cards `app.js` L705–715 |

---

## 3. Trust / safety (אמון ובטיחות)

1. **Off-platform chat rules** — Intent is right (keep deals on ORVO; allow demo hosts pre-pay). Reality: regex allow/deny in the browser; admin exempt; no DB trigger / Edge Function; easy to paraphrase phones (“five four seven…”), use code words, or paste via API. Post-pay “more links allowed” (`chatPaidPhase`) widens leak window exactly when money is at risk.

2. **Admin email hardcoding** — Personal Gmail in public Netlify asset + fallback string in `app.js`. Attack surface: phishing, account takeover = full approve/reject + all-requests visibility. Admin must be server-side claim (`is_admin` set only by service role), never email equality in the client.

3. **Payment theater** — Worst trust bug: user can believe they paid / builder believes job is funded. Manual `confirm()` is fraud-complete for a two-sided marketplace demo gone public.

4. **No escrow / milestone / dispute** — Upwork’s reason to exist. Without hold-and-release, ORVO is a lead gen form + chat, not a safe marketplace.

5. **Vetting is shallow** — Bio 50 chars + skills string + optional URLs; approve/reject binary; no ID check, no sample work gate, no probation, no public builder profile clients can inspect before accept.

6. **Privacy** — Builder emails shown to admin in clear; client request content visible to all approved builders (by design) but **any** approved builder can open Message — not “private chat” until a quote/accept relationship exists.

7. **Secrets** — Anon key in client is normal for Supabase; **all** safety is RLS. Repo has no SQL migrations; app constantly assumes missing policies. Treat RLS audit as P0 companion work (Role 02).

8. **Legal vacuum** — No ToS assigning liability, IP on delivered agents, or prohibition of off-platform payment. Enforcement copy in chat has no policy page to cite.

---

## 4. Missing must-haves vs competitors

### vs Upwork (general freelance, still the trust benchmark)

| Must-have | ORVO |
|-----------|------|
| Escrow / milestone payments | Missing (stub) |
| Verified payouts (Connect / withhold) | Missing |
| Dispute / mediation | Missing |
| Reviews & job success history | Missing |
| Searchable freelancer profiles + portfolio | Missing (apply form only) |
| Proposals with structured scope | Quote = price + free text |
| Messaging gated to proposals / hires | Open to all open jobs |
| Notifications (email/push) | Admin toast only |
| Fees transparent at quote/pay | Fee = 0, no disclosure |
| Account recovery | Missing |

### vs ServedByAI / AI-agent marketplaces

| Must-have | ORVO |
|-----------|------|
| Live catalog of agents / builders | Fake hero card only |
| Category/skill matching | Category on post; builders see **all** open jobs |
| Demo / video / sandbox proof | Allowed as links in chat only; no structured slot |
| Pricing norms / packages | Free-text budget hint |
| Buyer protection narrative backed by product | Copy only |
| SEO/content pages for demand | Single `index.html` |
| Builder CRM (pipeline of quotes) | Thin “My quotes” list |

**Niche advantage ORVO *could* own:** “Custom AI agent build jobs, manually vetted builders, WhatsApp/voice/automation SMB” — but inventory, matching, and money rails are required before that niche beats “post on Upwork / WhatsApp a freelancer.”

---

## 5. Top 10 fixes (impact / effort)

Ranked for **impact ÷ effort** on becoming a real MVP (not a big-company rebuild).

| Rank | Fix | Impact | Effort | Notes |
|------|-----|--------|--------|-------|
| 1 | **Kill fake pay path.** Until Stripe works: remove “Secure payments via Stripe” copy; `acceptQuote` must not set `paid`/`funded` without provider confirmation. | Critical | S | Integrity; hours |
| 2 | **Stripe Checkout (or Payment Intent) per quote + webhook → `payments.status`.** Bind `quote_id`, amount, client. | Critical | M | Replace Payment Link stub |
| 3 | **Server-side admin + RLS.** Remove client email admin; never `update is_admin` from anon; hide admin email from UI. | Critical | M | Blocks takeover |
| 4 | **Server-side message validation** (Edge Function or CHECK/trigger) + drop admin bypass for contact leaks. | High | M | Makes anti-leak real |
| 5 | **Gate chat:** message only if owner, quoted builder, or assigned; remove “Message” on cold open jobs. | High | S | Trust + spam |
| 6 | **Fix `routeAfterAuth` / login** to respect `isBuilder`/`isPending`/`isAdmin` (don’t re-`go` with signup intent on login). | High | S | Obvious builder bug |
| 7 | **Minimal job lifecycle:** accept → in_progress → client “Mark complete” → release (even manual Stripe payout v1) + decline other quotes. | High | M | Makes “pay safe” honest |
| 8 | **Public builder profile** after approve (skills, portfolio, years) visible on quote cards before Accept & pay. | High | M | Competes with Upwork at hire moment |
| 9 | **Legal + fee page** (ToS, Privacy, off-platform rule, fee %). Link from footer + pay confirm. | Med-High | S | Required to charge |
| 10 | **Structured post form** (title, category, budget range enum, deadline) + email notify builders on new open job. | Med | M | Liquidity / conversion |

**Explicit non-goals for next wave:** redesign fonts for taste, full dual-role IA, Hebrew i18n, complex matching ML — none fix the “we don’t actually take payment” problem.

---

## Judge notes for implementers

- Live site ≈ local: same stub Stripe, same admin Gmail, same claims. Deploying more UI without payment truth increases liability.
- Prefer **honest MVP labels** (“Payments coming — chat & quotes live”) over silent stubs.
- Role 02 (Security) and Role 03 (Payments) should own P0-1…P0-6 before UX polish roles ship chrome.

**— ORVO Role 01 · Chief Product Judge**
