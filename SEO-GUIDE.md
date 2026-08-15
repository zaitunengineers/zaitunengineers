# Zaitun Engineers — SEO Launch Guide

This covers everything needed to get zaitunengineers.com ranking #1 for
"Zaitun Engineers" searches, get your product photos showing in Google
Images with details, and keep that ranking stable long-term.

---

## 0. First, the honest answer to your main worry

You asked: if nobody visits the site for a few months, will it drop in
rankings? **For your own company name specifically — no, not really.**

"Zaitun Engineers" is a unique, exact-match name. Almost no other
business on earth is competing with you for that exact phrase. Google
doesn't rank branded, low-competition searches based on ongoing traffic
— it ranks them based on:
1. Does Google know the site exists and is indexed?
2. Does the site clearly, unambiguously represent "Zaitun Engineers"
   (title tags, structured data, address, phone — all matching)?
3. Is there a stronger, more established entity with the same name?

For you, #3 is basically not a concern. #1 and #2 are what this guide
solves. Once indexed and set up correctly, a branded query like this
is stable for years even with zero visits — traffic volume matters much
more for *competitive* keywords ("aluminium casting company Gujarat"),
which is a longer-term project, not this week's task.

What *would* hurt you: the domain expiring, the site going offline for
an extended period, or the URL structure changing without redirects.
Keep the domain renewed and the site up, and you're safe.

---

## 1. Files in this package — what to upload where

Upload ALL of these to the root of your GitHub repo (same folder as
index.html), then push to your live domain:

- `favicon.ico`, `favicon-16x16.png`, `favicon-32x32.png`,
  `apple-touch-icon.png`, `android-chrome-192x192.png`,
  `android-chrome-512x512.png` — full favicon set generated from your logo
- `site.webmanifest` — lets the site be "added to home screen" properly
- `robots.txt` — tells Google it's allowed to crawl everything
- `sitemap.xml` — tells Google exactly which pages and images exist
- `index.html`, `products.html` — updated with favicons, canonical tags,
  and structured data (see below)

`index.html` and `products.html` already have `<link>` tags pointing to
all of the above, plus JSON-LD structured data in the `<head>` — you
don't need to add anything manually, just upload the files.

**⚠️ One thing you must do before this all works: replace the domain.**
Every file currently uses `https://www.zaitunengineers.com/` as a
placeholder (in `robots.txt`, `sitemap.xml`, and the `canonical` /
`og:url` tags in both HTML files). Once you've actually bought your
domain, tell me the exact one and I'll swap it everywhere in one pass —
or find-and-replace it yourself if it's not exactly that.

---

## 2. Google Search Console (do this first, takes 10 minutes)

This is how you tell Google the site exists and hand it the sitemap.

1. Go to [search.google.com/search-console](https://search.google.com/search-console)
2. Add property → choose **"URL prefix"** → enter your full domain
   (e.g. `https://www.zaitunengineers.com`)
3. Verify ownership — easiest method for GitHub Pages: **HTML file
   upload** (Google gives you a file, you add it to your repo root) or
   **HTML tag** (paste a meta tag into `<head>` — send it to me and
   I'll add it for you)
4. Once verified, go to **Sitemaps** in the left menu → submit
   `sitemap.xml`
5. Go to **URL Inspection**, paste your homepage URL, click **Request
   Indexing**. Do the same for `/products.html`.

That's it — Google will typically index both pages within a few days.

---

## 3. Google Business Profile — this matters more than anything else

For "Zaitun Engineers" searches specifically, your **Google Business
Profile (GBP)** — the map/panel that shows up on the right side of
search results — usually outranks and outweighs the website itself.
I found your listing is already live and verified, matching the phone
number on your site. Good. Now optimize it:

1. Go to [business.google.com](https://business.google.com), claim/sign
   into your existing listing
2. **Add the website URL** — once your domain is live, add it here.
   This is the single biggest link connecting your GBP to your website.
3. **Upload real photos** — shop floor, machines, finished parts, and
   your logo. GBP listings with 10+ photos get significantly more
   engagement than ones with none.
4. **Fill in business hours, category** ("Casting company" / "Metal
   fabricator" — Google has specific manufacturing categories, pick
   the closest match), and a business description using the same
   wording as your site (consistency helps Google connect the two).
5. **Get a handful of reviews.** Even 5–10 genuine reviews from past
   clients meaningfully improves how prominently the listing shows.
6. Keep your **NAP** (Name, Address, Phone) *identical* everywhere —
   GBP, website, and any directory listings. Mismatched addresses or
   phone numbers across platforms actively hurts local ranking.

---

## 4. Business directory citations (secondary, but free and easy)

These won't move the needle alone, but they reinforce to Google that
"Zaitun Engineers, GIDC Vapi" is a real, consistent entity — and they
often rank on page 1 themselves for related searches, which is useful
even before your own site fully ranks:

- **IndiaMART** — very high-traffic for exactly this industry in India
- **TradeIndia**
- **JustDial**
- **ExportersIndia**
- A **Facebook Page** and **LinkedIn Company Page**, both linking to
  the website — also helps social signals and gives you another
  surface for sharing product photos

Use the exact same name, address, and phone number as the website and
GBP on every one of these.

---

## 5. Getting your product photos into Google Images with details

Three things make this work, and all three are now in place in the
files I've built:

1. **Structured data (`Product` schema)** on `products.html` — tells
   Google each image is a specific named product with a description
   and manufacturer, which is what allows Google Images to show extra
   detail (not just a bare thumbnail) when your photos appear.
2. **Image sitemap** (`sitemap.xml`) — explicitly lists each product
   image with a title and caption so Google finds and understands them
   even before it has crawled the full page.
3. **Descriptive `alt` text** — already on every image in your HTML
   (e.g. "Machined aluminium ring — Zaitun Engineers").

One more lever, optional but worth doing eventually: **rename the image
files themselves** to be descriptive (`aluminium-flange-ring.jpg`
instead of `arc-6.png`). Filenames are a minor ranking signal for
Google Images. I didn't do this now since it would mean re-uploading
files you may have already pushed live — happy to do it in a future
pass if you want to line it up with getting real specs from the client.

---

## 6. Ongoing maintenance (low effort, do occasionally)

- Every time you add a new product photo or page, submit it via
  **URL Inspection → Request Indexing** in Search Console — don't
  wait for Google to find it on its own.
- If you ever change a URL (rename `products.html`, move to a new
  domain, etc.), set up a redirect from the old URL — don't just delete
  it. Broken links are the one thing that reliably hurts a stable
  ranking.
- Check Search Console's **Coverage** report every month or two just to
  confirm nothing's erroring out — takes two minutes.
- Keep the Google Business Profile description and photos fresh a
  few times a year — recency is a (minor) ranking factor for GBP
  specifically, unlike the website itself.

---

## 8. Setting up Google Analytics 4 (GA4)

GA4 tracking code is already embedded in every page (`index.html`,
`products.html`, `404.html`, `privacy.html`) with a placeholder ID —
`G-XXXXXXXXXX`. It won't track anything until you swap that for a real
Measurement ID. Here's how to get one:

1. Go to [analytics.google.com](https://analytics.google.com) and sign
   in with the same Google account you used for Search Console (keeps
   things simple, not required).
2. Click **Admin** (gear icon, bottom left) → **Create Account**.
   - Account name: `Zaitun Engineers`
   - Leave the data-sharing settings on their defaults, click Next.
3. **Create a Property**:
   - Property name: `Zaitun Engineers Website`
   - Time zone: `India (GMT+5:30)`
   - Currency: `Indian Rupee (INR)`
4. Fill in basic business details when asked (industry category:
   something like "Manufacturing" or "Industrial" — whichever fits
   best in the dropdown).
5. Under **Data Streams**, choose **Web**.
   - Website URL: your real domain (e.g. `https://www.zaitunengineers.com`)
   - Stream name: `Zaitun Engineers Website`
6. Click through, and GA4 will show you a **Measurement ID** that
   looks like `G-ABC1234XYZ`. That's the one you need.
7. Send me that ID and I'll swap it into all four pages in one pass —
   or find-and-replace `G-XXXXXXXXXX` yourself in each file (it
   appears 3 times per page).
8. Give it 24–48 hours, then check **Reports → Realtime** in GA4 while
   you browse the live site yourself — you should see your own visit
   show up, confirming it's wired correctly.

**What you'll actually get from this:** which pages people spend time
on, whether they're coming from Google, WhatsApp shares, or direct
links, what device/location they're browsing from, and — most usefully
for you — whether people are actually reaching the Products page and
Contact form, or dropping off before that. That's the kind of thing
that tells you what to fix on the site next, rather than guessing.



## 9. Quick summary — what's done vs. what you still need to do

**Done for you in this package:**
- Full favicon set (browser tab icon, Android/iOS home-screen icons)
- `robots.txt` + `sitemap.xml` with image entries
- LocalBusiness structured data on the homepage (name, address, geo,
  phone, hours)
- Product structured data + BreadcrumbList on the products page
- Canonical URLs and updated Open Graph/Twitter tags on all pages
- `CNAME` for custom domain on GitHub Pages
- `404.html` — on-brand error page
- `privacy.html` — Privacy Policy, linked in every footer
- GA4 tracking snippet embedded on all pages (placeholder ID)
- `humans.txt` — minor credit file

**Still on you:**
- Buy the domain, tell me the exact one so I can lock it into every
  file (currently a placeholder everywhere)
- Set up Search Console, verify, submit sitemap (Section 2)
- Optimize the Google Business Profile — website link, photos, hours,
  reviews (Section 3) — **this is the highest-impact thing you can do**
- Create your GA4 property and send me the real Measurement ID
  (Section 8)
- Optional: list on IndiaMART/TradeIndia/JustDial (Section 4)
