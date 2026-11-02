"use node";
import webpush from "web-push";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";
import { isAllowedPushEndpoint } from "./lib/pushEndpoint";
import { notificationCategoryValidator } from "./lib/notificationCategories";

const TTL_SECONDS = 24 * 60 * 60;
const MAX_PAYLOAD_BYTES = 3000;
const MAX_DEVICES = 10;

export const send = internalAction({
  args: {
    notificationId: v.id("notifications"),
    urgent: v.boolean(),
    subscriptions: v.array(v.object({ endpoint: v.string(), p256dh: v.string(), auth: v.string() })),
    payload: v.object({ title: v.string(), body: v.string(), url: v.string(), category: notificationCategoryValidator, tag: v.string(), badgeCount: v.number(), notificationId: v.id("notifications") }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const publicKey = env.VAPID_PUBLIC_KEY?.trim(), privateKey = env.VAPID_PRIVATE_KEY?.trim(), subject = env.VAPID_SUBJECT?.trim();
    if (!publicKey || !privateKey || !subject) {
      console.warn("Web Push is not configured; skipping send.");
      await ctx.runMutation(internal.push.markPushed, { notificationId: args.notificationId, succeededEndpoints: [] });
      return null;
    }
    const body = JSON.stringify(args.payload);
    if (Buffer.byteLength(body) > MAX_PAYLOAD_BYTES) {
      console.warn("Push payload too large; skipping send.");
      await ctx.runMutation(internal.push.markPushed, { notificationId: args.notificationId, succeededEndpoints: [] });
      return null;
    }
    const succeeded: string[] = [];
    for (const subscription of args.subscriptions.slice(0, MAX_DEVICES)) {
      if (!isAllowedPushEndpoint(subscription.endpoint)) {
        console.warn("Removing a push subscription with a disallowed endpoint.");
        await ctx.runMutation(internal.push.removeSubscriptionByEndpoint, { endpoint: subscription.endpoint });
        continue;
      }
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, body, {
          TTL: TTL_SECONDS, urgency: args.urgent ? "high" : "normal", vapidDetails: { subject, publicKey, privateKey },
        });
        succeeded.push(subscription.endpoint);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await ctx.runMutation(internal.push.removeSubscriptionByEndpoint, { endpoint: subscription.endpoint });
        else console.warn(`Web Push send failed${status ? ` with status ${status}` : ""}.`);
      }
    }
    await ctx.runMutation(internal.push.markPushed, { notificationId: args.notificationId, succeededEndpoints: succeeded });
    return null;
  },
});
