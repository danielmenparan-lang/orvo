// Issue title fragments → Shopify fix hints (v1 static map)
window.SHOPPINGRED_PLAYBOOK = [
  { match: /missing gtin|identifier exists|gtin/i, fix: 'Shopify → Product → barcode / GTIN. Or set identifier_exists=false for custom goods.', field: 'barcode' },
  { match: /image|picture|main image/i, fix: 'Shopify → Product → Media: add a primary image ≥100×100, white/clean background preferred.', field: 'images' },
  { match: /availability|out of stock|in stock/i, fix: 'Shopify → Inventory: sync quantity; ensure Online Store channel is published.', field: 'inventory' },
  { match: /price|mismatch/i, fix: 'Landing page price must match feed. Check Shopify price, compare-at, and currency.', field: 'price' },
  { match: /shipping/i, fix: 'Merchant Center → Shipping settings, or add shipping column in feed for the affected country.', field: 'shipping' },
  { match: /landing page|crawl|404|unavailable/i, fix: 'Product must be published; no password page; URL returns 200 for Googlebot.', field: 'status' },
  { match: /title|description/i, fix: 'Improve title/description length and remove promotional text Google rejects.', field: 'title' },
  { match: /adult|policy|prohibited/i, fix: 'Review Google Shopping ads policies; may need attribute adult=true or remove SKU from Shopping.', field: 'policy' },
  { match: /brand/i, fix: 'Set Brand in Shopify (vendor) or custom product metafield used by your feed app.', field: 'vendor' },
  { match: /condition/i, fix: 'Set condition=new (or used/refurbished) in feed app / metafield.', field: 'condition' },
];

window.shoppingredLookupFix = function (issueTitle) {
  const t = String(issueTitle || '');
  for (const row of window.SHOPPINGRED_PLAYBOOK) {
    if (row.match.test(t)) return row;
  }
  return { match: null, fix: 'Open Merchant Center help for this issue string, then edit the matching Shopify field and re-upload feed.', field: 'unknown' };
};
