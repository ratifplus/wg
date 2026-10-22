// Pure scheduling logic. Dates are calendar days as "YYYY-MM-DD" strings in
// the house's time zone; arithmetic is done on UTC midnight of that day.

export type ChoreId = "trash" | "kitchen" | "bathroom" | "floors" | "fridges";

export interface Chore {
  id: ChoreId;
  title: string;
  detail: string;
  every: string;
}

export const CHORES: Record<ChoreId, Chore> = {
  trash: {
    id: "trash",
    title: "Trash",
    detail: "Empty all trash cans. Bins out.",
    every: "Every week",
  },
  kitchen: {
    id: "kitchen",
    title: "Kitchen",
    detail: "Counters, tables, stove, sink.",
    every: "Every 2 weeks",
  },
  bathroom: {
    id: "bathroom",
    title: "Bathroom & toilet",
    detail: "Toilet, sink, shower, mirror.",
    every: "Every 2 weeks",
  },
  floors: {
    id: "floors",
    title: "Floors",
    detail: "Vacuum and mop all floors.",
    every: "Every 2 weeks",
  },
  fridges: {
    id: "fridges",
    title: "Fridges",
    detail: "Both fridges. Remove old food, wipe shelves and doors.",
    every: "Every month",
  },
};

// The three general-cleaning jobs, done together every two weeks. Each
// person gets one of them, and they rotate every cycle.
export const CLEANING: ChoreId[] = ["kitchen", "bathroom", "floors"];

export interface Slot {
  chore: ChoreId;
  start: string;
  due: string;
  // Index into the members list in join order.
  memberIndex: number;
}

const DAY = 86_400_000;

function toMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromMs(toMs(date) + days * DAY);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY);
}

// Every job is due on a Friday. Missed jobs can still be done at the weekend.
const DUE_WEEKDAY = 5; // 0 = Sunday

function weekday(date: string): number {
  return new Date(toMs(date)).getUTCDay();
}

// The first Friday on or after `date`.
export function fridayOnOrAfter(date: string): string {
  return addDays(date, (DUE_WEEKDAY - weekday(date) + 7) % 7);
}

export function todayIn(timeZone: string, now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function lastFridayOfMonth(year: number, month: number): string {
  // month is 1-based; Date.UTC normalises month 13 and day 0.
  const last = fromMs(Date.UTC(year, month, 0));
  return addDays(last, -((weekday(last) - DUE_WEEKDAY + 7) % 7));
}

// The fridge deadline that `date` falls under: the last Friday of its month,
// or of the next month once that day has passed.
function fridgeDue(date: string): string {
  const [y, m] = date.split("-").map(Number);
  const due = lastFridayOfMonth(y, m);
  return date <= due ? due : lastFridayOfMonth(y, m + 1);
}

function monthIndex(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return y * 12 + (m - 1);
}

function later(a: string, b: string): string {
  return a > b ? a : b;
}

/**
 * Every chore slot whose period contains `date`, for a schedule that began
 * on `anchor` (the day the first person joined) with `members` people.
 * Everything is due on a Friday, and the first deadlines are the first
 * Friday on or after `anchor`, so the schedule starts in the week people join.
 *
 * - Trash: due every Friday, one person per week in turn.
 * - Kitchen, bathroom, floors: due every second Friday, one job each, rotating.
 * - Fridges: due the last Friday of each month, one person per month in turn.
 */
export function slotsOn(anchor: string, date: string, members: number): Slot[] {
  if (members < 1 || date < anchor) return [];
  const firstDue = fridayOnOrAfter(anchor);
  const sinceFirst = Math.max(0, daysBetween(firstDue, date));
  const slots: Slot[] = [];

  const week = Math.ceil(sinceFirst / 7);
  const weekDue = addDays(firstDue, week * 7);
  slots.push({
    chore: "trash",
    start: later(anchor, addDays(weekDue, -6)),
    due: weekDue,
    memberIndex: week % members,
  });

  const cycle = Math.ceil(sinceFirst / 14);
  const cycleDue = addDays(firstDue, cycle * 14);
  CLEANING.forEach((chore, i) => {
    slots.push({
      chore,
      start: later(anchor, addDays(cycleDue, -13)),
      due: cycleDue,
      memberIndex: (i + cycle) % members,
    });
  });

  // Offset by 2 so that the first month's fridges don't land on the person
  // who also has the first week's trash and the first kitchen.
  // The first fridge deadline is at least a week out, so nobody gets a day's notice.
  const firstFridge = fridgeDue(addDays(anchor, 7));
  const due = later(fridgeDue(date), firstFridge);
  const [y, m] = due.split("-").map(Number);
  const month = monthIndex(due) - monthIndex(firstFridge);
  slots.push({
    chore: "fridges",
    start: due === firstFridge ? anchor : addDays(lastFridayOfMonth(y, m - 1), 1),
    due,
    memberIndex: (month + 2) % members,
  });

  return slots;
}

/** The slots that start right after the current ones, for an "up next" view. */
export function nextSlots(anchor: string, date: string, members: number): Slot[] {
  return slotsOn(anchor, date, members).map((slot) => {
    const next = slotsOn(anchor, addDays(slot.due, 1), members).find(
      (s) => s.chore === slot.chore,
    );
    return next!;
  });
}

export type ReminderKind = "assigned" | "due" | "overdue";

export interface ReminderState {
  start: string;
  due: string;
  done: boolean;
  notifiedOn: string | null;
  dueNotifiedOn: string | null;
  lastReminderOn: string | null;
}

/**
 * Which email, if any, the assignee should get today:
 * - "assigned" once, when the period starts;
 * - "due" on the due day (unless "assigned" went out that same day);
 * - "overdue" every 2 days after the due day until the job is marked done.
 */
export function reminderFor(task: ReminderState, today: string): ReminderKind | null {
  if (task.done || today < task.start) return null;
  if (!task.notifiedOn) return "assigned";
  if (today === task.due) {
    if (task.dueNotifiedOn || task.notifiedOn === today) return null;
    return "due";
  }
  if (today > task.due) {
    const last = task.lastReminderOn ?? task.due;
    return daysBetween(last, today) >= 2 ? "overdue" : null;
  }
  return null;
}
