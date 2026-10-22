import { describe, expect, it } from "vitest";
import { addDays, fridayOnOrAfter, nextSlots, reminderFor, type ReminderState, slotsOn, todayIn } from "../src/schedule";

const ANCHOR = "2026-10-22"; // a Thursday: the day the first person joined

function slot(date: string, chore: string, members = 3) {
  return slotsOn(ANCHOR, date, members).find((s) => s.chore === chore)!;
}

describe("fridayOnOrAfter", () => {
  it("returns the same or next Friday", () => {
    expect(fridayOnOrAfter("2026-10-22")).toBe("2026-10-23");
    expect(fridayOnOrAfter("2026-10-23")).toBe("2026-10-23");
    expect(fridayOnOrAfter("2026-10-24")).toBe("2026-10-30");
  });
});

describe("slotsOn", () => {
  it("has nothing before the schedule starts or without members", () => {
    expect(slotsOn(ANCHOR, "2026-10-21", 3)).toEqual([]);
    expect(slotsOn(ANCHOR, "2026-10-22", 0)).toEqual([]);
  });

  it("starts in the week people join, with trash due this Friday", () => {
    expect(slot("2026-10-22", "trash")).toMatchObject({ start: "2026-10-22", due: "2026-10-23", memberIndex: 0 });
  });

  it("rotates the trash weekly, due every Friday", () => {
    const weeks = ["2026-10-23", "2026-10-24", "2026-10-31", "2026-11-06"].map((d) => slot(d, "trash"));
    expect(weeks.map((s) => s.due)).toEqual(["2026-10-23", "2026-10-30", "2026-11-06", "2026-11-06"]);
    expect(weeks.map((s) => s.memberIndex)).toEqual([0, 1, 2, 2]);
    expect(weeks[1].start).toBe("2026-10-24");
  });

  it("gives each person a different cleaning job, due every second Friday, rotating", () => {
    const first = ["kitchen", "bathroom", "floors"].map((c) => slot("2026-10-22", c));
    expect(first.map((s) => s.due)).toEqual(["2026-10-23", "2026-10-23", "2026-10-23"]);
    expect(first.map((s) => s.memberIndex).sort()).toEqual([0, 1, 2]);
    const second = ["kitchen", "bathroom", "floors"].map((c) => slot("2026-10-24", c));
    expect(second[0]).toMatchObject({ start: "2026-10-24", due: "2026-11-06" });
    expect(second.map((s) => s.memberIndex)).toEqual(first.map((s) => (s.memberIndex + 1) % 3));
  });

  it("rotates the fridges monthly, due the last Friday", () => {
    const oct = slot("2026-10-22", "fridges");
    const nov = slot("2026-10-31", "fridges");
    const dec = slot("2026-12-01", "fridges");
    expect(oct).toMatchObject({ start: "2026-10-22", due: "2026-10-30" });
    expect(nov).toMatchObject({ start: "2026-10-31", due: "2026-11-27" });
    expect(dec).toMatchObject({ start: "2026-11-28", due: "2026-12-25" });
    expect(new Set([oct.memberIndex, nov.memberIndex, dec.memberIndex]).size).toBe(3);
  });

  it("gives the first fridge deadline at least a week", () => {
    const late = slotsOn("2026-10-28", "2026-10-28", 3).find((s) => s.chore === "fridges")!;
    expect(late).toMatchObject({ start: "2026-10-28", due: "2026-11-27" });
  });

  it("still covers every job with fewer people", () => {
    const slots = slotsOn(ANCHOR, "2026-10-22", 1);
    expect(slots).toHaveLength(5);
    expect(slots.every((s) => s.memberIndex === 0)).toBe(true);
  });
});

describe("nextSlots", () => {
  it("returns the period after each current one", () => {
    const next = Object.fromEntries(nextSlots(ANCHOR, "2026-10-22", 3).map((s) => [s.chore, s.due]));
    expect(next).toEqual({
      trash: "2026-10-30",
      kitchen: "2026-11-06",
      bathroom: "2026-11-06",
      floors: "2026-11-06",
      fridges: "2026-11-27",
    });
  });
});

describe("reminderFor", () => {
  const base: ReminderState = { start: "2026-10-17", due: "2026-10-23", done: false, notifiedOn: null, dueNotifiedOn: null, lastReminderOn: null };

  it("announces the job once when the period starts", () => {
    expect(reminderFor(base, "2026-10-17")).toBe("assigned");
    expect(reminderFor({ ...base, notifiedOn: "2026-10-17" }, "2026-10-18")).toBeNull();
  });

  it("reminds on the due day", () => {
    const sent = { ...base, notifiedOn: "2026-10-17" };
    expect(reminderFor(sent, "2026-10-23")).toBe("due");
    expect(reminderFor({ ...sent, dueNotifiedOn: "2026-10-23" }, "2026-10-23")).toBeNull();
    expect(reminderFor({ ...base, notifiedOn: "2026-10-23" }, "2026-10-23")).toBeNull();
  });

  it("reminds every 2 days after the due day until done", () => {
    let task = { ...base, notifiedOn: "2026-10-17", dueNotifiedOn: "2026-10-23" };
    const sentOn: string[] = [];
    for (let d = 1; d <= 8; d++) {
      const today = addDays("2026-10-23", d);
      if (reminderFor(task, today) === "overdue") {
        sentOn.push(today);
        task = { ...task, lastReminderOn: today };
      }
    }
    // Friday due, then Sunday, Tuesday, ...
    expect(sentOn).toEqual(["2026-10-25", "2026-10-27", "2026-10-29", "2026-10-31"]);
    expect(reminderFor({ ...task, done: true }, "2026-11-10")).toBeNull();
  });
});

describe("todayIn", () => {
  it("uses the house's time zone", () => {
    expect(todayIn("Europe/Berlin", new Date("2026-10-22T22:30:00Z"))).toBe("2026-10-23");
    expect(todayIn("UTC", new Date("2026-10-22T22:30:00Z"))).toBe("2026-10-22");
  });
});
