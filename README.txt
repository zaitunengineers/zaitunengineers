ZAITUN ENGINEERS — WEBSITE
==========================

FILES IN THIS REPO
- index.html         Homepage (includes new Products preview section)
- products.html       NEW — full product catalogue page, linked from
                       index.html's "View All Products" button
- logo.jpg             Site logo — keep as-is, already in repo
- arc-1.jpg … arc-6.jpg   NEW optimized product photos (see below —
                       replace the old arc-1.PNG…arc-6.PNG references)

IMAGE UPDATE — IMPORTANT
The old arc-1.PNG…arc-6.PNG files were 1.4–2.1MB EACH (~11MB total),
which is slow to load, especially on mobile data. They've been
recompressed to arc-1.jpg…arc-6.jpg at the same visual quality but a
fraction of the size (~100KB each, ~660KB total). Upload these 6 new
.jpg files to the repo alongside (or replacing) the old .PNG ones —
both index.html and products.html now reference the .jpg versions.
You can delete the old .PNG files once confirmed the site works.

STATUS / TO DO BEFORE FULL LAUNCH
- The About section's photo grid references ze-1.jpg through ze-9.jpg
  (renamed from product-1.jpg…9.jpg per request). These are NOT in the
  repo yet — real shop-floor and product photos are still pending from
  the client. Until added, that grid will show broken images.
- products.html has placeholder specs ([Add size/spec], [Add alloy
  grade], [Add weight]) on every product card — send real figures for
  each of the 6 components and product names/part numbers if you want
  something other than the current generic titles (Aluminium Ring,
  Stepped Housing, Machined Ring, Flanged Bushing, Mounting Flange,
  Flange Ring).
- Contact info (phone, WhatsApp, email, address, map pin) is live and
  verified against the real Google Business listing for Zaitun Engineers.
- Formspree endpoint (xaewdwao) is wired to the enquiry form — test a
  real submission end-to-end to confirm it reaches the client's inbox.
- Stats: "30+ years" reflects casting operations since ~1990 (factory
  itself established 1983). Confirm exact figures with the client.
- Update og:image / og:url in both index.html and products.html <head>
  once you know the actual live domain this site will be deployed to.

DEPLOY
This is a static site — drag the whole folder into Netlify Drop
(app.netlify.com/drop), import into Vercel, or serve via GitHub Pages.
No build step needed.
