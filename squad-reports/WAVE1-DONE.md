# Wave 1 — Integrity freeze DONE

Date: 2026-08-23

## Shipped
- **P0-1** `acceptQuote` no longer marks `paid`/`funded` without checkout; status → `awaiting_payment`, payment → `pending`
- **P0-2** Landing copy already de-Stripe’d earlier this night
- **P0-3/P0-4** Client cannot self-elevate admin; SQL triggers + DB-only `is_admin`
- **P0-6** Sibling pending quotes → `rejected` on accept
- **P1-9** `statusLabel()` for human badges
- **P1-10** Non-admin profile/debug/SQL filenames stripped

## Exit gates
- [x] Manual confirm does not set funded/paid for clients
- [x] Trust strip does not claim live Stripe
- [x] Accept rejects other pending quotes
- [x] Non-admin Profile has no admin-email / SQL dump
- [x] Commit + push

## Next (Wave 2)
Login routing, chat relationship gate, pay sheet, Stripe scaffold
