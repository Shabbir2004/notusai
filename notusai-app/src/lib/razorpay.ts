import Razorpay from "razorpay";

let rzpInstance: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (!rzpInstance) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set.");
    }
    rzpInstance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return rzpInstance;
}

export async function createPaymentLink(opts: {
  amountInr: number;
  description: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  noticeId: string;
}): Promise<{ short_url: string; id: string }> {
  const rzp = getRazorpay();
  // Razorpay amount is in paise (1 INR = 100 paise)
  const link = await rzp.paymentLink.create({
    amount: opts.amountInr * 100,
    currency: "INR",
    accept_partial: false,
    description: opts.description,
    customer: {
      name: opts.customerName,
      email: opts.customerEmail,
      contact: opts.customerPhone,
    },
    notify: { sms: !!opts.customerPhone, email: true },
    reminder_enable: true,
    notes: { notice_id: opts.noticeId },
    callback_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/dashboard/notice/${opts.noticeId}`,
    callback_method: "get",
  });

  return { short_url: link.short_url, id: link.id };
}
