import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function inrFmt(rupees: number): string {
  return "₹" + rupees.toLocaleString("en-IN");
}

export function formatDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function classifyTier(demandRupees: number, noticeType: string): {
  tier: "simple" | "medium" | "complex";
  price: number;
} {
  const isFraudCase = /sec(tion)?\s*74|fraud/i.test(noticeType);
  if (isFraudCase || demandRupees >= 1_000_000) return { tier: "complex", price: 4999 };
  if (demandRupees >= 200_000) return { tier: "medium", price: 1999 };
  return { tier: "simple", price: 999 };
}
