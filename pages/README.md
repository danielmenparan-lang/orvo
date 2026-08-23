# `/pages` — routing note (static SPA)

ORVO ships as a **static SPA** (`index.html` + `app.js`). There is no Next/Astro file-based router yet.

**SEO niche landings live at the site root** so Netlify (or any static host) can serve them as real HTML documents for crawlers:

| Intent | File | Notes |
|--------|------|--------|
| HE restaurant WhatsApp agent | `/whatsapp-restaurants.html` | Hebrew-first; links back to `index.html` |
| EN builders (draft) | `docs/marketing/seo/for-builders-en.md` | HTML optional; homepage `#builders` for now |

Do **not** put crawlable marketing HTML only under `/pages/` unless the host rewrites those paths — crawlers and social previews need a direct URL.

When a real router lands, migrate these to `/he/...` and `/en/...` and keep 301s from the `.html` stubs.
