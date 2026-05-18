# Razorpay Setup — Accept Payments in 30 Minutes

Razorpay is India's most popular payment gateway. Free to set up. Charges ~2% per transaction. You'll use it to collect ₹999/1,999/4,999 from CAs.

---

## What you need before starting

- PAN card (yours)
- Aadhaar card (yours)
- Bank account (yours — savings is fine to start)
- Cancelled cheque OR bank passbook photo
- Mobile number (for OTP)

---

## Step-by-step setup

### Step 1: Sign up

1. Go to **razorpay.com**
2. Click "Sign Up"
3. Enter business email + password
4. Verify email + phone via OTP

### Step 2: Business details

1. Business name: `NotusAI` (or whatever you've named it)
2. Business type: **Sole Proprietorship** (simplest — no GST registration needed if you're under ₹20L turnover)
3. Business category: **IT Services / Software**
4. Sub-category: **SaaS**

### Step 3: KYC (~10 min)

Upload:
- PAN card photo
- Aadhaar card photo
- Bank account details (account number + IFSC)
- Cancelled cheque OR passbook first page

Razorpay verifies usually within 24-48 hours. You can start CREATING payment links immediately, but money settles to your bank only after KYC is verified.

### Step 4: Test the setup

Create a test payment link:

1. Dashboard → "Payment Links" → "Create Link"
2. Description: "Test payment"
3. Amount: ₹10
4. Customer: yourself (your phone)
5. Generate link → open on your phone → pay ₹10 via UPI

Money will show in your dashboard within minutes. Settlement to bank in 2-3 days.

---

## Creating a payment link for each customer

### The fast workflow

For every notice you deliver:

1. Razorpay Dashboard → "Payment Links" → "Create Link"
2. Fill in:
   ```
   Description: NotusAI - ASMT-10 reply draft for Sharma Textile
   Amount: 1999
   Currency: INR
   Customer name: Rakesh Mehta
   Customer phone: +919876543210
   Customer email: rakesh@mehta-ca.com
   ```
3. Generate → copy the link → send via WhatsApp/email

Customer pays via UPI / cards / netbanking. You get notification instantly. Money settles to your account in 2-3 business days.

### What it looks like to the customer

They click the link → see a clean page with your business name + amount → tap "Pay" → choose UPI → enter PIN → done. Takes 30 seconds.

---

## Auto-collecting with payment links template

When you have 5+ paying customers, create a template:

1. Razorpay Dashboard → "Payment Links" → "Templates"
2. Create template:
   - Name: "NotusAI Notice Reply"
   - Description: "Notice reply draft for {client_name}"
   - Amount: variable (you set per link)
3. Use template every time → saves 1 min per link

---

## Pricing strategy with Razorpay

### Don't undercut yourself

You CAN create ₹500 or ₹250 payment links. **Don't.** Once you sell at ₹500, you can never go back to ₹999.

### Test premium pricing

After 10 customers at ₹999, try ₹1,499 for the next ones. If 7 out of 10 still pay, you've validated the higher price. Most CAs won't notice/care — they bill their own clients ₹15K for the same notice.

### Bundle for repeat customers

When a CA has paid for 3+ notices, send them a bundle offer:
- "5 notices at ₹3,999" (save ₹996) — they prepay, you have committed revenue
- "10 notices at ₹6,999" — even better commitment

Use Razorpay Subscriptions feature for monthly committed plans (when you're ready).

---

## Settlement & taxes

### When does the money hit your bank?

- T+2 days standard (Tuesday payment → Thursday in bank)
- T+1 available on premium plans (not worth the cost early on)

### TDS

Razorpay deducts no TDS from you. But your CA customer may deduct TDS @ 10% on payments > ₹30K to a single vendor in a year. If a CA's annual spend with you crosses ₹30K, they may ask for your PAN and deduct TDS. Provide PAN, file your ITR claiming TDS credit.

### GST registration

You DON'T need GST registration until your annual turnover crosses **₹20 lakh** (₹40 lakh in some states). For most of your first year, you'll be well under this. Just mention "Not GST registered (under threshold)" on your invoices.

When you do cross ₹20L (good problem!), register for GST, charge 18% GST on top of your prices, file GSTR-1 and GSTR-3B monthly. Your own CA can help (or use your own product 😄).

### Income tax

Sole proprietorship income is taxed under your personal slab. Plan to set aside ~25-30% of every Razorpay payment for income tax. File ITR-3 every July. A CA charges ₹3-5K for this — worth paying.

---

## Refund policy

Have one even before you need it. Add this to your landing page footer:

```
Refund Policy:
- First draft for any new customer is free, no payment required.
- If you find a paid draft unusable, request a refund within 7 days
  of delivery. Full refund processed within 3 business days.
- After 7 days, no refunds. (We've revised based on your feedback by then.)
```

You'll rarely need to refund. But having the policy builds trust.

---

## Pro tips

### Tip 1: Send link WITH the draft, not before

Customer should see quality first, then pay. Higher conversion.

### Tip 2: Set link expiry

In Razorpay link options, set expiry to 7 days. Creates gentle urgency. Customer pays faster.

### Tip 3: Send the same link via 2 channels

WhatsApp + email both. WhatsApp = read fast. Email = forwarded to their accountant for actual payment.

### Tip 4: Track conversion

In your Google Sheet, track:
- Date link sent
- Date payment received
- Lag in days

Average payment lag should be < 3 days. If a customer takes 7+ days repeatedly, send a polite nudge.

### Tip 5: Use UPI directly for very small first transactions

If a CA wants to pay ₹999 for an instant test, share your UPI ID directly: `yourname@oksbi` or similar. No Razorpay fee on UPI. Use this only for first transactions with skeptical customers. Move them to Razorpay payment links for everything after.

---

## When to upgrade beyond payment links

Move to a full Razorpay integration (subscriptions, automated billing, customer portal) when:
- You have 20+ active customers
- You want to charge monthly retainers
- You're tired of creating manual links

At that point, hire a developer for 2 days (₹15-25K) to integrate Razorpay subscriptions into your website. Or use Bolt.new / v0 to scaffold it yourself.

---

## A final note on cash flow

The single biggest reason solo founders die is running out of cash before product-market fit.

You will be fine on cash if you stick to this rule:

**Don't spend a rupee on the business until you've earned ₹10 from a customer.**

That means:
- No domain until first customer pays
- No tools until first 5 customers pay
- No hires until ₹2L MRR

Razorpay's job is to deliver cash to your bank fast. Your job is to spend it slow.
