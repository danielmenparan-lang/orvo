# Wave 2G — GTM / SEO DONE

**Agent:** G (GTM Assets)  
**Date:** 2026-08-23  
**Branch:** `cursor/orvo-local-site-3bd5`

## Shipped

| Asset | Path |
|-------|------|
| HE restaurant SEO draft | `docs/marketing/seo/whatsapp-bot-restaurants-he.md` |
| EN builders SEO draft | `docs/marketing/seo/for-builders-en.md` |
| Day 0 publish order checklist | top of `docs/marketing/LAUNCH-KIT.md` |
| SEO status table in LAUNCH-KIT §6 | same |
| Static SPA routing note | `pages/README.md` |
| Hebrew SEO landing (crawlable) | `whatsapp-restaurants.html` → links to `index.html` + UTM `wa_restaurant` |

## Notes

- Site remains a static SPA; niche HTML lives at **site root** (not under `/pages/`) so Netlify can index it.
- Builders EN is draft-only for now; CTA points at homepage `#builders`.
- No auto-posting. Founder publishes from LAUNCH-KIT Day 0 checklist.

## Exit

- [x] Drafts + live HE landing
- [x] LAUNCH-KIT Day 0 checklist
- [x] CAMPAIGN-LOG + this DONE note
- [x] Commit + push (`pull --rebase` first)
