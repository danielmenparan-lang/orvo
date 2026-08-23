# ORVO i18n / RTL prep (P2-7)

**Status:** Prep only — EN-primary global product. Do not ship full Hebrew UI until core loop is live with Stripe.

## Display currency flag

`supabase-config.js`:

```js
window.ORVO_DISPLAY_CURRENCY = 'USD'; // or 'ILS' for he-IL formatting experiments
```

`app.js` `money()` → `formatMoney(cents, ORVO_DISPLAY_CURRENCY)`.

Settlement currency stays **USD** until Checkout supports multi-currency + Connect FX.

## RTL shell plan (later)

1. Add `dir="rtl"` experiment page (e.g. `he.html` or `?lang=he`) — do not flip `index.html` default.
2. Mirror: nav, hero CTAs, modal close, dashboard sidebar tabs, chat bubbles.
3. Keep brand mark **ORVO** LTR (proper name).
4. Numbers/currency: use `Intl` (`he-IL` + `ILS`) via the display flag above.
5. Copy: HE marketing pages already exist as acquisition (`whatsapp-restaurants.html`); product chrome stays EN until bilingual ops is staffed.

## Do not

- Lock product geography to Israel
- Default the main SPA to RTL
- Mix ₪ quote amounts into the global USD quote path without FX rules
