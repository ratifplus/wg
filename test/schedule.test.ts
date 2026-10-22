import { describe, expect, it } from "vitest";
import { addDays, nextSlots, reminderFor, type ReminderState, slotsOn, todayIn, weekStart } from "../src/schedule";

const ANCHOR = "2026-10-19"; // a Monday

function who(date: string, members = 3) {
  return Object.fromEntries(slotsOn(ANCHOR, date, members).map((s) => [s.chore, s.memberIndex]));
}

describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart("2026-10-22")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });
});

describe("slotsOn", () => {
  it("has nothing before the schedule starts or without members", () => {
    expect(slotsOn(ANCHOR, "2026-10-18", 3)).toEqual([]);
    expect(slotsOn(ANCHOR, "2026-10-20", 0)).toEqual([]);
  });

  it("rotates the trash weekly, due on Sunday", () => {
    const weeks = [0, 1, 2, 3].map((w) => slotsOn(ANCHOR, addDays(ANCHOR, w * 7 + 3), 3)[0]);
    expect(weeks.map((s) => s.memberIndex)).toEqual([0, 1, 2, 0]);
    expect(weeks[0]).toMatchObject({ chore: "trash", start: "2026-10-19", due: "2026-10-25" });
  });

  it("gives each person a different cleaning job every two weeks, rotating", () => {
    const first = who("2026-10-19");
    const sameCycle = who("2026-11-01");
    const second = who("2026-11-02");
    expect([first.kitchen, first.bathroom, first.floors].sort()).toEqual([0, 1, 2]);
    expect(sameCycle).toMatchObject({ kitchen: first.kitchen, bathroom: first.bathroom, floors: first.floors });
    expect(second.kitchen).toBe(first.bathroom);
    expect(second.bathroom).toBe(first.floors);
    expect(second.floors).toBe(first.kitchen);
    const kitchen = slotsOn(ANCHOR, "2026-10-19", 3).find((s) => s.chore === "kitchen")!;
    expect(kitchen).toMatchObject({ start: "2026-10-19", due: "2026-11-01" });
  });

  it("rotates the fridges monthly, due at month end", () => {
    const oct = slotsOn(ANCHOR, "2026-10-30", 3).find((s) => s.chore === "fridges")!;
    const nov = slotsOn(ANCHOR, "2026-11-15", 3).find((s) => s.chore === "fridges")!;
    const dec = slotsOn(ANCHOR, "2026-12-01", 3).find((s) => s.chore === "fridges")!;
    expect(oct).toMatchObject({ start: "2026-10-19", due: "2026-10-31" });
    expect(nov).toMatchObject({ start: "2026-11-01", due: "2026-11-30" });
    expect(new Set([oct.memberIndex, nov.memberIndex, dec.memberIndex]).size).toBe(3);
  });

  it("still covers every job with fewer people", () => {
    const slots = slotsOn(ANCHOR, "2026-10-20", 2);
    expect(slots).toHaveLength(5);
    expect(slots.every((s) => s.memberIndex < 2)).toBe(true);
  });
});

describe("nextSlots", () => {
  it("returns the period after each current one", () => {
    const next = Object.fromEntries(nextSlots(ANCHOR, "2026-10-22", 3).map((s) => [s.chore, s.start]));
    expect(next).toEqual({
      trash: "2026-10-26",
      kitchen: "2026-11-02",
      bathroom: "2026-11-02",
      floors: "2026-11-02",
      fridges: "2026-11-01",
    });
  });
});

describe("reminderFor", () => {
  const base: ReminderState = { start: "2026-10-19", due: "2026-10-25", done: false, notifiedOn: null, dueNotifiedOn: null, lastReminderOn: null };

  it("announces the job once when the period starts", () => {
    expect(reminderFor(base, "2026-10-19")).toBe("assigned");
    expect(reminderFor({ ...base, notifiedOn: "2026-10-19" }, "2026-10-20")).toBeNull();
  });

  it("reminds on the due day", () => {
    const sent = { ...base, notifiedOn: "2026-10-19" };
    expect(reminderFor(sent, "2026-10-25")).toBe("due");
    expect(reminderFor({ ...sent, dueNotifiedOn: "2026-10-25" }, "2026-10-25")).toBeNull();
    expect(reminderFor({ ...base, notifiedOn: "2026-10-25" }, "2026-10-25")).toBeNull();
  });

  it("reminds every 2 days after the due day until done", () => {
    let task = { ...base, notifiedOn: "2026-10-19", dueNotifiedOn: "2026-10-25" };
    const sentOn: string[] = [];
    for (let d = 1; d <= 8; d++) {
      const today = addDays("2026-10-25", d);
      if (reminderFor(task, today) === "overdue") {
        sentOn.push(today);
        task = { ...task, lastReminderOn: today };
      }
    }
    expect(sentOn).toEqual(["2026-10-27", "2026-10-29", "2026-10-31", "2026-11-02"]);
    expect(reminderFor({ ...task, done: true }, "2026-11-10")).toBeNull();
  });
});

describe("todayIn", () => {
  it("uses the house's time zone", () => {
    expect(todayIn("Europe/Berlin", new Date("2026-10-22T22:30:00Z"))).toBe("2026-10-23");
    expect(todayIn("UTC", new Date("2026-10-22T22:30:00Z"))).toBe("2026-10-22");
  });
});
