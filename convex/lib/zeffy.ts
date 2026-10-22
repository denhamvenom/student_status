export interface ZeffyCampaign { id: string; url: string; title: string; category: string; currency: string }
export interface ZeffyPayment { id: string; created: number; amount: number; currency: string; status: string; type: string; refund_status: string; refund_count: number; has_dispute: boolean; campaign_id: string; campaign_type: string; campaign_category: string; items: Array<{ type: string; amount: number; currency: string }> }

export function canonicalZeffyUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || !["zeffy.com", "www.zeffy.com"].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port || url.hash) return null;
    const path = url.pathname.replace(/^\/[a-z]{2}-[a-z]{2}(?=\/fundraising\/)/i, "").replace(/\/+$/, "");
    if (!path.startsWith("/fundraising/") || path === "/fundraising/") return null;
    return `https://www.zeffy.com${path.toLowerCase()}`;
  } catch { return null; }
}

export function isZeffySlot(now: number): boolean {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  return [7, 19].includes(Number(parts.find(part => part.type === "hour")?.value));
}

export function paymentSafety(payment: ZeffyPayment): string | null {
  if (!payment.id || !payment.campaign_id || !Number.isSafeInteger(payment.created) || payment.created <= 0 || !Number.isSafeInteger(payment.amount) || payment.amount <= 0) return "invalidPayment";
  if (payment.refund_status !== "none" || payment.refund_count > 0 || payment.has_dispute) return "refundOrDispute";
  if (payment.status !== "succeeded") return "notSucceeded";
  if (payment.currency.toLowerCase() !== "usd" || payment.type !== "online" || payment.campaign_type !== "donation_form" || payment.campaign_category !== "peer_to_peer" || payment.items.length === 0 || payment.items.some(item => item.type !== "donation" || item.currency.toLowerCase() !== "usd" || !Number.isSafeInteger(item.amount) || item.amount <= 0) || payment.items.reduce((sum, item) => sum + item.amount, 0) !== payment.amount) return "unsupportedPayment";
  return null;
}
