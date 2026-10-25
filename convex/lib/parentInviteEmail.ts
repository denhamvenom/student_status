import { env } from "../_generated/server";

export type EmailConfiguration = { apiKey: string; from: string; replyTo: string; origin: string };

// Email is an explicit opt-in. A bad or absent setting leaves the share link usable.
export function parentInviteEmailConfiguration(): EmailConfiguration | null {
  if (env.PARENT_INVITE_EMAIL_ENABLED !== "true") return null;
  const apiKey = env.RESEND_API_KEY?.trim();
  const from = env.PARENT_INVITE_EMAIL_FROM?.trim() ?? "Denham Venom Student Status <notifications@team8044.org>";
  const replyTo = env.PARENT_INVITE_EMAIL_REPLY_TO?.trim() ?? "coach@team8044.org";
  const origin = env.PARENT_INVITE_APP_ORIGIN?.trim();
  if (!apiKey || !from || !origin || /[\r\n]/.test(from)) return null;
  const address = from.match(/^(?:[^<>\r\n]+ <)?([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>?$/)?.[1];
  if (!address || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(replyTo)) return null;
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin || url.username || url.password) return null;
    if (env.SITE_URL && new URL(env.SITE_URL).origin !== origin) return null;
  } catch { return null; }
  return { apiKey, from, replyTo, origin };
}
