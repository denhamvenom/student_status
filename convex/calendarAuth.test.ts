import { afterEach, describe, expect, it, vi } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import { googleServiceToken } from "./lib/googleAuth";
import { serviceToken } from "./lib/calendarAuth";
import { allowedAuthRedirect } from "./lib/authRedirect";
import { normalizeCalendarEvent } from "./lib/calendarNormalize";

describe("OAuth redirect allowlist", () => {
  const student = "https://students.example.test";
  const clock = "https://clock.example.test";
  it("accepts only configured entry paths", () => {
    expect(allowedAuthRedirect("/", student, clock)).toBe(`${student}/`);
    expect(allowedAuthRedirect(`${student}/invite-parent`, student, clock)).toBe(`${student}/invite-parent`);
    expect(allowedAuthRedirect("/invite-adult", student, clock)).toBe(`${student}/invite-adult`);
    expect(allowedAuthRedirect(`${student}/invite-adult`, student, clock)).toBe(`${student}/invite-adult`);
    expect(allowedAuthRedirect(`${clock}/`, student, clock)).toBe(`${clock}/`);
  });
  it.each(["//evil.example/", "https://evil.example/", "https://clock.example.test.evil.example/", "javascript:alert(1)", "https://clock.example.test/admin", "https://clock.example.test/invite-adult", "https://clock.example.test@evil.example/", "https://clock.example.test/#fragment", "https://students.example.test/invite-adult#token=secret", "/invite-adult/", "/invite-adult-extra"])("rejects %s", value => {
    expect(() => allowedAuthRedirect(value, student, clock)).toThrow();
  });
});

describe("calendar normalization", () => {
  it("preserves recurring instance identity and distinct DST offsets", () => {
    const event = normalizeCalendarEvent({ id: "instance-1", recurringEventId: "series", originalStartTime: { dateTime: "2026-11-01T01:30:00-05:00" }, start: { dateTime: "2026-11-01T01:30:00-05:00" }, end: { dateTime: "2026-11-01T01:30:00-06:00" }, status: "confirmed" }, 100, 1);
    expect(event).toMatchObject({ sourceKey: "instance-1", recurringEventId: "series", scheduledStart: Date.parse("2026-11-01T01:30:00-05:00"), scheduledEnd: Date.parse("2026-11-01T01:30:00-06:00") });
  });
  it("keeps all-day exclusive end as dates", () => {
    expect(normalizeCalendarEvent({ id: "all-day", start: { date: "2026-10-12" }, end: { date: "2026-10-13" } }, 100, 1)).toMatchObject({ allDay: true, allDayStartDate: "2026-10-12", allDayEndDate: "2026-10-13" });
  });
  it("accepts a cancellation tombstone without a schedule", () => {
    expect(normalizeCalendarEvent({ id: "instance-1", status: "cancelled" }, 100, 2)).toMatchObject({ sourceKey: "instance-1", cancelled: true });
  });
  it("rejects an active event with no valid window so sync cannot reconcile it away", () => {
    expect(normalizeCalendarEvent({ id: "instance-1", status: "confirmed", start: { dateTime: "invalid" }, end: { dateTime: "invalid" } }, 100, 2)).toBeNull();
  });
});

describe("service account key stored on one line", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("works through both the shared Google token and the Calendar token when line breaks are written as backslash-n", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    const pem = await exportPKCS8(privateKey);
    const oneLine = pem.trim().replace(/\n/g, "\\n");
    expect(oneLine).toContain("\\n");
    expect(oneLine).not.toContain("\n");
    const scopes: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      scopes.push(JSON.parse(Buffer.from(new URLSearchParams(String(init?.body)).get("assertion")!.split(".")[1], "base64url").toString()).scope);
      return new Response(JSON.stringify({ access_token: "synthetic-token" }), { status: 200 });
    }));
    expect(await googleServiceToken("sa@synthetic.invalid", oneLine, "scope-a")).toBe("synthetic-token");
    expect(await serviceToken("sa@synthetic.invalid", oneLine)).toBe("synthetic-token");
    expect(scopes).toEqual(["scope-a", "https://www.googleapis.com/auth/calendar.readonly"]);
    await expect(googleServiceToken("sa@synthetic.invalid", "not a key", "s")).rejects.toThrow();
  });
});
