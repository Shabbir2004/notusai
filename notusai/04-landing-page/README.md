# Landing Page — Deployment Guide

You have a complete landing page in `index.html`. Now you need it live on the internet so you can put the URL in your outreach messages.

You have 3 options. **Pick the easiest one (Option A) for now.**

---

## Before deploying — customize 3 things

Open `index.html` in a text editor and find/replace:

1. **WhatsApp number:** Replace `91XXXXXXXXXX` (appears 2 times) with your full WhatsApp number including country code, no `+` or spaces. Example: `919876543210`
2. **Email:** Replace `hello@notusai.in` with your real email until you have a domain. Use your Gmail.
3. **Logo letter:** The "N" in the logo. Change if you want a different brand letter.

Save the file.

---

## Option A: Deploy on GitHub Pages (FREE, takes 10 minutes)

This is the cleanest free option.

### Steps:

1. Go to **github.com** → Sign up (free)
2. Create a new repository:
   - Repository name: `notusai`
   - Set as **Public**
   - Don't initialize with README
3. On the new empty repo page, click **"uploading an existing file"**
4. Drag and drop `index.html` from `D:\Startup_Ideas\notusai\04-landing-page\`
5. Scroll down, click **"Commit changes"**
6. Go to Settings → Pages
7. Source: select **"Deploy from a branch"**
8. Branch: select **`main`** → Folder: `/ (root)` → Save
9. Wait 1-2 minutes
10. Your site is live at: `https://[yourusername].github.io/notusai/`

Use that URL in your outreach. Done.

---

## Option B: Deploy on Carrd.co (FREE, simpler but limited)

Carrd is drag-and-drop, no GitHub needed. Limited to 1 site on free plan.

### Steps:

1. Go to **carrd.co** → Sign up free
2. Click "Start" → "Create a new site"
3. Choose template: "Profile" or "Form"
4. **Manually rebuild** your page (Carrd doesn't accept HTML upload on free plan):
   - Copy headline from `index.html`
   - Copy subtitle, stats, pricing
   - Add a button linking to your WhatsApp `https://wa.me/91XXXXXXXXXX`
5. Set subdomain: `notusai.carrd.co` (free)
6. Publish

You get `notusai.carrd.co` for free. Looks slightly less custom than GitHub Pages but is easier.

---

## Option C: Buy domain + deploy on Vercel (FREE hosting, ₹800/year domain)

Do this when you have your first paying customer. Then you can afford ₹800.

### Steps:

1. Buy `notusai.in` on **Hostinger** or **Namecheap** for ~₹800/year
2. Sign up on **vercel.com** (free)
3. Install Vercel CLI: open PowerShell, run `npm install -g vercel`
   (You'll need Node.js installed first — download from nodejs.org)
4. Navigate to landing-page folder:
   ```powershell
   cd D:\Startup_Ideas\notusai\04-landing-page
   ```
5. Run `vercel` — follow prompts to deploy
6. In Vercel dashboard → Settings → Domains → add `notusai.in`
7. In Hostinger/Namecheap DNS → point to Vercel's nameservers
8. Live at `notusai.in` in ~24 hours

---

## After deploying

1. **Test on your phone.** Open the URL on mobile, click the WhatsApp button — make sure it opens WhatsApp to YOUR number.
2. **Add the URL to your email signature.**
3. **Add to your LinkedIn profile.**
4. **Put it in every outreach message you send.**

---

## What to improve later (when you have time/money)

Future enhancements you can make to the landing page:

### Phase 2 (after 5 customers):
- Add a real testimonial section ("Sharma & Co, Pune — saved 4 hours on a ₹3.4L ASMT-10")
- Add a "Sample draft" downloadable PDF
- Add a counter ("47 notices drafted last month")

### Phase 3 (after 20 customers):
- Add a self-serve upload form (drag-drop PDF)
- Add a pricing calculator
- Add an embedded WhatsApp chat widget
- Replace static page with React/Next.js (when you have a developer or know how to code)

### Phase 4 (real product):
- Login + dashboard
- Notice queue
- Litigation tracker
- All the things in the original NOTUS_PLAN.md

Don't do any of this until customers tell you to. The current page is 100% sufficient for finding your first 20 customers.

---

## A note on the design

The page is intentionally:
- **Sparse** — Indian CAs are skeptical of flashy startups. Sober design = serious tool
- **Black-and-white** — no AI-startup gradient cliches
- **One CTA** — "Get first draft free" repeated 2 times. No menu, no distraction.
- **Mobile-first** — most CAs will open this on phone after a WhatsApp message
- **No login, no signup form** — friction kills early-stage conversion. WhatsApp is the funnel.

This is intentional minimalism, not laziness. Many great B2B SaaS sites look like this (Linear.app, Plain.com, Resend.com).
