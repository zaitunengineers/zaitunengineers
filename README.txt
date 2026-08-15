ZAITUN ENGINEERS — WEBSITE
==========================

FILES IN THIS REPO
- index.html      The complete website (single file, no build step)
- logo.jpg         Site logo, used in nav + footer + favicon
- arc-1.PNG … arc-6.PNG   Product photos used in the hero carousel

STATUS / TO DO BEFORE FULL LAUNCH
- The About section references product-1.jpg through product-9.jpg for
  the photo grid. These are NOT in the repo yet — real shop-floor and
  product photos are still pending from the client. Until they're added,
  that grid will show broken images. Add the 9 files with those exact
  names, or edit the <div class="pgrid"> block in index.html to use
  fewer/existing images.
- Contact info (phone, WhatsApp, email, address, map pin) is live and
  verified against the real Google Business listing for Zaitun Engineers.
- Formspree endpoint (xaewdwao) is wired to the enquiry form — test a
  real submission end-to-end to confirm it reaches the client's inbox.
- Stats: "30+ years" reflects casting operations since ~1990 (factory
  itself established 1983). Confirm exact figures with the client.

DEPLOY
This is a static site — drag the whole folder into Netlify Drop
(app.netlify.com/drop), import into Vercel, or serve via GitHub Pages.
No build step needed.
