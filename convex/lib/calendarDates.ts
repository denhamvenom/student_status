/** Convert a Calendar date-only field to the Chicago midnight it denotes. */
export function chicagoMidnight(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const probe = Date.UTC(year, month - 1, day, 6);
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "shortOffset" }).formatToParts(new Date(probe)).find(part => part.type === "timeZoneName")?.value ?? "";
  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(offset);
  if (!match) throw new Error("Calendar Chicago timezone could not be resolved.");
  const minutes = (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === "+" ? 1 : -1);
  return Date.UTC(year, month - 1, day) - minutes * 60_000;
}

export function chicagoDate(time: number): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(time));
  const get = (name: string) => parts.find(part => part.type === name)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
