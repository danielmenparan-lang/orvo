# `/pages` — routing note (static SPA)

ORVO ships as a **static SPA** (`index.html` + `app.js`). There is no Next/Astro file-based router yet.

**SEO niche landings live at the site root** so Netlify (or any static host) can serve them as real HTML documents for crawlers:

| Intent | File | Notes |
|--------|------|--------|
| EN builders (global) | `/for-builders.html` | English SEO; links → `index.html` |
| HE restaurant WhatsApp (optional regional) | `/whatsapp-restaurants.html` | Hebrew acquisition channel — not product geography lock |
| Drafts | `docs/marketing/seo/` | Markdown outlines for the HTML landings |

Do **not** put crawlable marketing HTML only under `/pages/` unless the host rewrites those paths — crawlers and social previews need a direct URL.

When a real router lands, migrate these to `/he/...` and `/en/...` and keep 301s from the `.html` stubs.
