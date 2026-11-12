import { describe, expect, it } from "vitest";
import { definition, eventTabs, type Data } from "./event";

const H = 3_600_000;
const T0 = Date.UTC(2027, 0, 15, 15, 0);
const base: Data = {
  event: { name: "Synthetic Open", type: "Competition", startsAt: T0, endsAt: T0 + 8 * H, destination: "Synthetic Arena", capacity: 20, overnight: false, roomingEnabled: false, shiftsEnabled: false, permissionRequired: true },
  questions: [], participants: [], mentors: [], rooming: null, shifts: null, attendance: null,
  transport: { enabled: false, state: "notApplicable", seats: 0, demand: 0, busSeats: 0, open: [], vehicles: [] },
};
const person = (studentId: string, name: string, status: string, extra: Partial<Data["participants"][number]> = {}) => ({ studentId, name, subteam: "Build", status, independentTravel: false, ready: status === "confirmed" ? true : null, missing: [], answers: [], ...extra });
const clocked = (studentId: string, name: string, intervals: { inAt: number; outAt: number }[], extra: { signedUp?: boolean; confirmed?: boolean; corrections?: number } = {}) => ({ studentId, name, subteam: "Build", signedUp: true, confirmed: true, intervals, corrections: 0, ...extra });

describe("event spreadsheet tabs", () => {
  it("leaves out tabs that do not apply", () => {
    expect(eventTabs(base).map(t => t.title)).toEqual(["Summary", "Who's going"]);
  });

  it("counts signups and keeps fees out", () => {
    const tabs = eventTabs({ ...base, participants: [person("a", "Ann", "confirmed"), person("b", "Bo", "confirmed", { ready: false, missing: ["Permission form"] }), person("c", "Cy", "waitlist", { missing: ["Signup not confirmed yet"] }), person("d", "Di", "withdrawn")] });
    const summary = new Map(tabs[0].rows.map(r => [r[0], r[1]]));
    expect([summary.get("Signed up"), summary.get("Confirmed"), summary.get("Ready (not counting fees)"), summary.get("Waitlisted"), summary.get("Withdrew"), summary.get("Fee")]).toEqual([3, 2, 1, 1, 1, "See the Money folder"]);
    expect(tabs[1].rows.map(r => r[0])).toEqual(["Name", "Ann", "Bo", "Cy", "Di"]);
    expect(tabs[1].rows[2]).toEqual(["Bo", "Build", "Confirmed", "No", "Permission form"]);
    expect(summary.has("Showed up")).toBe(false);
  });

  it("writes one answer column per question, marking removed questions", () => {
    const tabs = eventTabs({ ...base, questions: [{ id: "q1", prompt: "Shirt size", archived: false }, { id: "q2", prompt: "Diet", archived: true }], participants: [person("a", "Ann", "confirmed", { answers: [{ questionId: "q1", value: "M" }, { questionId: "q2", value: ["Nuts", "Dairy"] }] }), person("b", "Bo", "pending")] });
    const tab = tabs.find(t => t.title === "Question answers")!;
    expect(tab.rows[0]).toEqual(["Name", "Status", "Shirt size", "Diet (removed)"]);
    expect(tab.rows[1]).toEqual(["Ann", "Confirmed", "M", "Nuts; Dairy"]);
    expect(tab.rows[2].slice(2)).toEqual(["", ""]);
  });

  it("adds Mentors, Rooming and Rides only when they apply", () => {
    const tabs = eventTabs({
      ...base, participants: [person("a", "Ann", "confirmed", { independentTravel: true })],
      mentors: [{ name: "Moe", response: "accepted", canDrive: true, needsHotel: null }],
      rooming: [{ student: "Zed", room: "", category: "", finalized: false, needsReview: false, requested: true }, { student: "Ann", room: "Room 1", category: "Girls", finalized: true, needsReview: false, requested: false }],
      transport: { enabled: true, state: "open", seats: 4, demand: 6, busSeats: 0, open: ["2 more passenger seats are needed."], vehicles: [{ driver: "Dee", vehicle: "Van", seats: 4 }] },
    });
    expect(tabs.map(t => t.title)).toEqual(["Summary", "Who's going", "Mentors", "Rooming", "Rides"]);
    expect(tabs[2].rows[1]).toEqual(["Moe", "Accepted", "Yes", ""]);
    expect(tabs[3].rows.slice(1).map(r => [r[0], r[5]])).toEqual([["Ann", "In a room"], ["Zed", "Asked to be assigned"]]);
    expect(tabs[4].rows.map(r => r[0])).toEqual(["Type", "Driver", "Own transport", "Seats available", "Seats needed", "Still open"]);
  });

  it("flags No-show and Walk-in, counts corrections and totals corrected time", () => {
    const tabs = eventTabs({
      ...base, participants: [person("a", "Ann", "confirmed"), person("b", "Bo", "confirmed"), person("c", "Cy", "pending")],
      attendance: { sessionState: "closed", people: [
        clocked("a", "Ann", [{ inAt: T0, outAt: T0 + H }, { inAt: T0 + 2 * H, outAt: T0 + 2.5 * H }], { corrections: 2 }),
        clocked("b", "Bo", []),
        clocked("z", "Zed", [{ inAt: T0, outAt: T0 + H }], { signedUp: false, confirmed: false, corrections: 1 }),
      ] },
    });
    const att = tabs.find(t => t.title === "Attendance")!;
    expect(att.rows[0]).toHaveLength(9);
    expect(att.rows.slice(1).map(r => [r[0], r[2], r[3], r[6], r[7], r[8]])).toEqual([["Ann", "Yes", "Yes", 1.5, 2, ""], ["Bo", "Yes", "No", "", 0, "No-show"], ["Zed", "No", "Yes", 1, 1, "Walk-in"]]);
    const summary = new Map(tabs[0].rows.map(r => [r[0], r[1]]));
    expect([summary.get("Showed up"), summary.get("No-shows"), summary.get("Walk-ins")]).toEqual([2, 1, 1]);
  });

  it("does not call a missing clock-in a No-show while the session is still open", () => {
    const att = eventTabs({ ...base, attendance: { sessionState: "open", people: [clocked("b", "Bo", [])] } }).find(t => t.title === "Attendance")!;
    expect(att.rows[1][8]).toBe("");
  });

  it("counts a shift as worked only when a clock-in overlaps it", () => {
    const shifts = [{ label: "Pit crew", startsAt: T0 + 2 * H, endsAt: T0 + 4 * H, capacity: 3, students: [{ studentId: "a", name: "Ann" }, { studentId: "b", name: "Bo" }, { studentId: "c", name: "Cy" }] }];
    const people = [clocked("a", "Ann", [{ inAt: T0 + 3 * H, outAt: T0 + 5 * H }]), clocked("b", "Bo", [{ inAt: T0, outAt: T0 + 2 * H }])];
    const withClock = eventTabs({ ...base, event: { ...base.event, shiftsEnabled: true }, shifts, attendance: { sessionState: "closed", people } }).find(t => t.title === "Shifts")!;
    expect(withClock.rows[0].slice(-1)).toEqual(["Worked"]);
    expect(withClock.rows[1].slice(3)).toEqual([3, 3, 0, "Ann; Bo; Cy", 1]);
    const without = eventTabs({ ...base, event: { ...base.event, shiftsEnabled: true }, shifts }).find(t => t.title === "Shifts")!;
    expect(without.rows[0]).not.toContain("Worked");
  });
});

describe("event spreadsheet file", () => {
  it("is an Events file named after the event and its date", () => {
    const title = definition.title({ seasonName: "Synthetic 2027", event: { name: "Synthetic Open", startsAt: T0 } });
    expect([definition.folder, definition.scope, definition.ready, title]).toEqual(["events", "event", true, "Synthetic Open - Jan 15, 2027"]);
  });
});
