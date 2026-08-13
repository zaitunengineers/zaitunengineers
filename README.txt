ZAITUN ENGINEERS — WEBSITE PACKAGE
==================================

CONTENTS
- index.html          The complete website (open in any browser)
- images/             Put the site photos here (see below)
- download-images.bat Windows: double-click to auto-download all photos
- download-images.sh  Mac/Linux: run `bash download-images.sh`

IMAGES
The site works immediately because every image falls back to an online
link if the local file is missing. For the final, fast, offline version:
  1. Run the downloader script above (it fills images/ automatically), OR
  2. Save your own real factory photos into images/ using these names:
     hero.jpg, about.jpg, casting-shop.jpg, vmc-machining.jpg,
     moulding.jpg, melting.jpg, components.jpg
     (Real photos of the client's plant are strongly recommended.)

BEFORE GOING LIVE
- Replace "Plot No. —" in the Contact section with the real address
- Replace YOUR_FORM_ID in the <form> tag with your Formspree form ID
- Update the stats numbers (25+, 120+, 500K+, 98%) with real figures

DEPLOY
Drag this whole folder into Netlify Drop (app.netlify.com/drop) or
import it in Vercel — no build step needed.
