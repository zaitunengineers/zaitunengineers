# Zaitun Billing

Private billing app for Zaitun Engineers. Cloudflare Pages + Pages Functions + D1. No build step.

- `public/` – the pages (build output directory = `public`)
- `functions/` – the server code (API)
- `lib/` – shared server helpers
- `database/` – SQL to paste into the D1 Console (run in order)

Secrets (set in the Cloudflare dashboard, never in this repo): `SETUP_KEY`.
Do not add wrangler.toml or package.json here.

## Stage 2 (v0.2.0)
Run `database/002_stage2.sql` once in the D1 Console (safe to run twice). It adds the clients, items and transporters tables.
No new secrets are needed.

## Stage 3 (v0.3.0)
Run `database/003_stage3.sql` once in the D1 Console. It adds bills and item groups, and new columns on clients, items, transporters and the firm. Run it only once: a second run stops with a harmless "duplicate column" message.
No new secrets are needed.

## Stage 4 (v0.4.0)
No SQL this time. Upload the repo and redeploy.
New: Preview, Print, PDF, WhatsApp and Email for every bill (layout copied from Aeon bill 308, with a same-state CGST + SGST version), Bulk Bill, Saved Documents (F9), Email/WhatsApp Settings, Digital Signature, and a Printing section in General Setting.
New libraries (self-hosted in public/assets/vendor): pdf-lib (MIT) and fontkit (MIT). Fonts: TeX Gyre Pagella (GUST Font License), in public/assets/fonts.
No new secrets are needed.

## Stage 5 (v0.5.0)
**Run `database/005_stage5.sql` once** in the D1 Console (Cloudflare → D1 → your database → Console, paste the file, Run). It adds the challan tables and a `bill_kind` column on bills. Run it only once: a second run stops at the last line with a harmless "duplicate column" message.
New: Delivery Challan (General), Opening / Issue / Receive Delivery Challan (Jobwork) and the Pending/Over/All Register, Proforma Invoice (Sales), and Jobwork/Service with Goods bills (they take the next Sales number and show a "J" in the Sale list). Every challan can be previewed, printed, saved as PDF, sent on WhatsApp or Email, and printed in bulk. The layouts are copied from Aeon's real challan and proforma PDFs.
Changed: bills brought over from Aeon can now be edited like any other bill.
Still greyed on purpose: Delivery Challan (Sales) and Delivery Challan (Branch Transfer), because Aeon shows no use of them in your data.
No new secrets are needed.
