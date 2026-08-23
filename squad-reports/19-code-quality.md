# 19 — Code Quality (`app.js`)

**Role:** Code quality / maintainability  
**Date:** 2026-08-23  
**Scope:** Vanilla JS marketplace SPA — `/workspace/app.js` (~1039 lines), `/workspace/index.html`, `/workspace/supabase-config.js`

---

## Verdict

`app.js` is a **competent MVP monolith**: single IIFE, clear section banners, delegated click router, real product rules (chat off-platform filter, builder vetting, manual payment confirm). It is already past the “one more feature” comfort zone. Next 3–5 features (ILS/RTL, Stripe, disputes, i18n) will fight global mutable state and untestable DOM coupling unless we modularize with a thin test harness that stays vanilla (no React rewrite required).

---

## Structure critique

### What works

| Pattern | Location | Why keep |
|---------|----------|----------|
| IIFE + `'use strict'` | top | No accidental globals |
| Section banners (`STATE`, `UTILS`, `CHAT FILTER`, …) | throughout | Navigable for humans |
| `data-action` / `data-goto` event router | ~946–1004 | Decouples HTML from many listeners |
| Chat policy as pure-ish helpers | `validateChatMessage`, URL/phone checks | Highest-value extract for unit tests |
| `needDb()` guard | ~203 | Fail loud when offline |
| Config via `window.ORVO_*` | `supabase-config.js` | Simple deploy knobs |

### Structural smells

1. **God module (~1040 LOC)** — auth, profiles, admin, jobs, quotes, chat realtime, payments UX, nav, and boot share one closure.
2. **Mutable shared state** — `db`, `user`, `profile`, `view`, `chatRequestId`, `chatSub`, `chatPoll`, `postSignupIntent`, `adminChannel` with no single state transition log → hard to reason about race (auth change vs chat poll).
3. **DOM ID coupling** — `$('…')` everywhere; renaming an HTML id silently breaks flows; no component boundary.
4. **Inline HTML strings** — `loadJobs` / `loadQuotes` / `loadChat` / `loadAdmin` build markup via template literals; XSS mostly mitigated by `esc()`, but presentation mixed with data fetching.
5. **Money hardcodes USD** — `money()` uses `'$'` + `en-US` despite chat filter knowing `₪`/`ILS` (blocks IL GTM; see report 16).
6. **Admin email fallback in source** — `ADMIN_EMAIL` constant duplicates config; elevates whoever matches on client (`isAdmin` also trusts `profile.is_admin`).
7. **Silent `catch`** — e.g. `refreshAdminBadge` swallows errors (“SQL not ready”); hides schema drift.
8. **Dual chat sync** — subscription + `chatPoll` interval; easy to leak timers if `stopChat` missed.
9. **Payment path is `confirm()` + row update** — fine for MVP; must isolate before Stripe so UI does not fork in 5 places.
10. **No modules / no tests** — zero automated regression for chat policy (security-sensitive) or fee math.

### Dependency graph (today)

```
index.html
  └─ supabase-config.js  → window.SUPABASE_*, ORVO_FEE_*, ORVO_ADMIN_*
  └─ app.js IIFE
        ├─ state (user/profile/view/chat*)
        ├─ utils + chatFilter
        ├─ supabase (connect, loadProfile, auth)
        ├─ ui (nav, modals, dashboard, render*)
        ├─ features (post, quote, apply, admin, chat, acceptQuote)
        └─ boot + event router
```

Everything depends on everything via closure. That is the core maintainability risk.

---

## Modularization plan (stay vanilla)

**Goal:** ES modules (or IIFE bundles) with **pure core** testable in Node; **DOM adapters** thin. No framework migration.

### Phase 0 — Extract pure kernels (1 PR, low risk)

Create `js/` (or `src/`) without changing UX:

| Module | Exports | Pulled from |
|--------|---------|-------------|
| `js/chat-policy.js` | `validateChatMessage`, URL/phone helpers, allowlists | lines ~84–159 |
| `js/money.js` | `formatMoney(cents, currency)`, `parseMoney`, `platformFee(cents, pct)` | `money`, `parseMoney`, fee lines in `acceptQuote` |
| `js/roles.js` | `isAdmin(profile, email, cfg)`, `isBuilder`, `isPending` | ~161–170 |

Wire via `<script type="module" src="app.js">` **or** keep classic scripts and attach `window.ORVO.chatPolicy` for zero-build deploys (Netlify static). Prefer **type=module** if local `python -m http.server` is the dev path (already is).

### Phase 1 — Services + state (2nd PR)

| Module | Responsibility |
|--------|----------------|
| `js/config.js` | Read `window.SUPABASE_*`, fee %, admin email; no secrets beyond anon key |
| `js/supabase-client.js` | `connect()`, `needDb()`, auth session helpers |
| `js/state.js` | `getState` / `setState` / `subscribe` (minimal pubsub) for `user`, `profile`, `view` |
| `js/api/requests.js` | CRUD requests |
| `js/api/quotes.js` | quote + accept |
| `js/api/chat.js` | messages, subscribe, poll, `stopChat` |
| `js/api/builders.js` | apply / approve / reject |

Keep SQL table names in one place.

### Phase 2 — UI slices (3rd PR)

| Module | Views |
|--------|-------|
| `js/ui/dom.js` | `$`, `esc`, `toast`, `showMsg` |
| `js/ui/nav.js` | `updateNav` |
| `js/ui/dashboard.js` | sidebar, `go`, open/close |
| `js/ui/render-list.js` | request/job/quote/admin list HTML |
| `js/ui/chat-view.js` | thread UI |
| `js/router-events.js` | body click + Escape + button bindings |
| `app.js` | compose + `boot()` only (~50–80 LOC) |

### Phase 3 — i18n / currency hooks (align with Israel report)

- `js/i18n.js` + `locales/he.json` / `en.json`
- `money.js` respects `currency: 'ILS' | 'USD'`
- RTL toggle sets `document.documentElement.dir`

### Explicit non-goals (for now)

- No React/Vue rewrite  
- No bundler mandatory (optional esbuild later)  
- No CSS-in-JS  

### File tree target

```
/workspace/
  index.html
  supabase-config.js
  app.js                 # boot + wire only
  js/
    chat-policy.js
    money.js
    roles.js
    config.js
    state.js
    supabase-client.js
    api/{requests,quotes,chat,builders}.js
    ui/{dom,nav,dashboard,render-list,chat-view}.js
    router-events.js
  tests/
    chat-policy.test.js
    money.test.js
    roles.test.js
```

---

## Test plan (vanilla JS marketplace)

### Tooling (lightweight)

- **Node 20+** + **node:test** (built-in) or **Vitest** if team prefers watch mode  
- Pure modules only in CI first — no Playwright until auth staging stable  
- Script: `"test": "node --test tests/"`  
- Optional later: Playwright smoke against `python3 -m http.server` + Supabase test project  

### Tier A — Unit (must have before modularization merges)

**`chat-policy`**

| Case | Expect |
|------|--------|
| Plain text | ok |
| Email address | block |
| US phone / IL `05x` / `+972` | block |
| `wa.me` / `t.me` / PayPal / Calendly | block |
| `github.com/...` before pay | allow |
| `vercel.app` demo before pay | allow |
| Random `https://example.com` before pay | block |
| Same random URL after `in_progress`/`funded` | allow |
| Amount text `₪6500` / `$120` does not trigger phone | allow |

**`money`**

| Case | Expect |
|------|--------|
| `formatMoney(650000, 'ILS')` | `₪6,500` (or `he-IL`) |
| `formatMoney(12000, 'USD')` | `$120` |
| `parseMoney('₪6,500')` / `'6500'` | agorot/cents consistent |
| `platformFee(10000, 10)` | 1000; `0%` → 0 |

**`roles`**

| Case | Expect |
|------|--------|
| matching admin email | admin |
| `builder_status: 'approved'` | builder |
| pending / null | client paths |

### Tier B — Integration (Supabase local or disposable project)

Use service role **only in CI secrets**, never in browser bundle.

| Flow | Assert |
|------|--------|
| Signup → profile row | profile exists, role client |
| Apply builder → pending | `builder_applications` row |
| Admin approve | `builder_status === 'approved'` |
| Post request → visible on jobs | RLS: builder can read open jobs |
| Quote → client sees quote | |
| Accept quote → status + payment row | fee fields correct |
| Chat insert → validateChatMessage enforced client-side; add DB check constraint or Edge later |

### Tier C — Browser smoke (manual → Playwright)

1. Cold load: no boot-error with valid config  
2. Signup / login / logout  
3. Client: post → see request → receive quote → chat → accept  
4. Builder: apply → (admin approve) → browse → quote → chat  
5. Admin: badge count, approve/reject  
6. Escape closes topmost modal  
7. Off-platform paste in chat shows toast error  

### Tier D — Regression checklist for every PR touching `app.js`

- [ ] Chat allow/deny matrix still green  
- [ ] Fee percent 0 and >0 both format correctly  
- [ ] `stopChat` clears sub + poll (no duplicate messages after navigate)  
- [ ] Admin path does not expose in UI for non-admin (RLS is source of truth)  

### Coverage targets (pragmatic)

- Phase 0 kernels: **≥90%** line coverage on `chat-policy` + `money`  
- Full app: do not chase %; chase **critical path smokes**  

---

## Priority backlog (for Ops / implementers)

1. **Extract `chat-policy` + unit tests** — security-sensitive, already pure enough  
2. **Fix `money()` for ILS** — unlocks Israel GTM (report 16)  
3. **`stopChat` audit + single realtime strategy** — prevent leaks  
4. **Split api vs render** for quotes/chat — next feature velocity  
5. **Stripe adapter module** — replace `confirm()` without rewriting UI  
6. **i18n/RTL module** — after money  

---

## Honesty bar

Do **not** rewrite the marketplace for elegance. Ship Phase 0 tests this week; modularize only at the seams above. The monolith is acceptable until Stripe + Hebrew land — then it becomes a liability.
