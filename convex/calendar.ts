import { env, internalAction, action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { normalizeCalendarEvent } from "./lib/calendarNormalize";
import { chicagoMidnight } from "./lib/calendarDates";
import { hashId, serviceToken } from "./lib/calendarAuth";
import { reconcileLinkedNow, reconcileOneNow } from "./eventCalendar";
import { v } from "convex/values";
import { isCalendarRefreshSlot } from "./lib/calendarSchedule";

async function refreshCalendar(ctx: ActionCtx): Promise<"refreshed" | "skipped" | "failed"> {
    const calendarId = env.TIMECLOCK_CALENDAR_ID;
    const email = env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL;
    const privateKey = env.TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (!calendarId || !email || !privateKey) return "failed";
    const now = Date.now();
    const state = await ctx.runMutation(internal.calendarState.begin, { calendarIdHash: await hashId(calendarId), now });
    if (!state) return "skipped";
    try {
      const token = await serviceToken(email, privateKey);
      let pageToken: string | undefined;
      let syncToken: string | undefined;
      let attemptedFullRetry = false;
      let priorToken = state.syncToken;
      let pages = 0;
      while (true) {
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("showDeleted", "true");
        url.searchParams.set("maxResults", "2500");
        if (priorToken) url.searchParams.set("syncToken", priorToken);
        else url.searchParams.set("timeMin", new Date(now - 60 * 86_400_000).toISOString());
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
        if (response.status === 410 && priorToken && !attemptedFullRetry) {
          priorToken = undefined; pageToken = undefined; attemptedFullRetry = true; pages = 0; continue;
        }
        if (!response.ok) throw new Error(`Calendar events request failed (${response.status})`);
        const data: unknown = await response.json();
        if (!data || typeof data !== "object") throw new Error("Calendar events response was invalid");
        const payload = data as { items?: unknown; nextPageToken?: unknown; nextSyncToken?: unknown };
        const items = payload.items === undefined ? [] : payload.items;
        if (!Array.isArray(items)) throw new Error("Calendar events list was invalid");
        for (const item of items) {
          if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Calendar event was invalid");
          const event = normalizeCalendarEvent(item as Record<string, unknown>, now, state.generation);
          if (!event) throw new Error("Calendar event was invalid");
          await ctx.runMutation(internal.timeclock.applyCalendarOccurrence, event);
          if (event.cancelled && event.providerUpdatedAt === undefined) await reconcileOneNow(ctx, event.sourceKey);
          else await ctx.runMutation(internal.eventCalendar.applyObserved, { eventId: event.sourceKey, title: event.title, location: typeof (item as Record<string, unknown>).location === "string" ? (item as Record<string, unknown>).location as string : "", start: event.scheduledStart ?? (event.allDayStartDate ? chicagoMidnight(event.allDayStartDate) : undefined), end: event.scheduledEnd ?? (event.allDayEndDate ? chicagoMidnight(event.allDayEndDate) : undefined), allDay: event.allDay, allDayStartDate: event.allDayStartDate, allDayEndDate: event.allDayEndDate, recurring: !!event.recurringEventId, cancelled: event.cancelled, etag: event.providerVersion, providerUpdatedAt: event.providerUpdatedAt, description: typeof (item as Record<string, unknown>).description === "string" ? (item as Record<string, unknown>).description as string : "" });
        }
        pageToken = typeof payload.nextPageToken === "string" ? payload.nextPageToken : undefined;
        syncToken = typeof payload.nextSyncToken === "string" ? payload.nextSyncToken : undefined;
        if (++pages > 20) throw new Error("Calendar sync exceeded its page limit");
        if (!pageToken) break;
      }
      if (!syncToken) throw new Error("Calendar did not return a sync token");
      if (!state.syncToken || attemptedFullRetry) {
        let cursor: string | null = null;
        for (let batch = 0; batch < 100; batch++) {
          const progress: { continueCursor: string | null; isDone: boolean } = await ctx.runMutation(internal.timeclock.reconcileCalendarGeneration, { generation: state.generation, cursor, windowStart: now - 60 * 86_400_000 });
          if (progress.isDone) break;
          if (!progress.continueCursor || batch === 99) throw new Error("Calendar reconciliation exceeded its batch limit");
          cursor = progress.continueCursor;
        }
        await reconcileLinkedNow(ctx);
      }
      await ctx.runMutation(internal.calendarState.finish, { generation: state.generation, now: Date.now(), syncToken });
      return "refreshed";
    } catch (error) {
      const message = error instanceof Error && /^(Calendar (?:token request failed|events request failed|events response was invalid|events list was invalid|event was invalid|did not return a sync token|sync exceeded its page limit|reconciliation exceeded its batch limit))/.test(error.message)
        ? error.message : "Calendar authentication or synchronization failed";
      await ctx.runMutation(internal.calendarState.finish, { generation: state.generation, now: Date.now(), error: message });
      return "failed";
    }
}

export const refresh = internalAction({
  args: {}, returns: v.null(),
  handler: async ctx => { await refreshCalendar(ctx); return null; },
});

export const scheduledRefresh = internalAction({
  args: {}, returns: v.null(),
  handler: async ctx => {
    // UTC candidate invocations outside the Chicago slot do no database or IO work.
    if (isCalendarRefreshSlot(Date.now())) await refreshCalendar(ctx);
    return null;
  },
});

export const refreshNow = action({
  args: {}, returns: v.object({ status: v.union(v.literal("refreshed"), v.literal("skipped"), v.literal("failed")) }),
  handler: async ctx => {
    await ctx.runQuery(internal.calendarState.requireOperator, {});
    try { return { status: await refreshCalendar(ctx) }; }
    catch { return { status: "failed" as const }; }
  },
});
