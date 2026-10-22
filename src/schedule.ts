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

// Monday of the week containing `date`.
export function weekStart(date: string): string {
  const weekday = new Date(toMs(date)).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
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

function lastDayOfMonth(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return fromMs(Date.UTC(y, m, 0));
}

function monthIndex(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return y * 12 + (m - 1);
}

/**
 * Every chore slot whose period contains `date`, for a schedule that began
 * on `anchor` (a Monday) with `members` people.
 *
 * - Trash: weekly, Monday to Sunday, one person per week in turn.
 * - Kitchen, bathroom, floors: every two weeks, one job each, rotating.
 * - Fridges: each calendar month, one person per month in turn.
 */
export function slotsOn(anchor: string, date: string, members: number): Slot[] {
  if (members < 1 || date < anchor) return [];
  const days = daysBetween(anchor, date);
  const slots: Slot[] = [];

  const week = Math.floor(days / 7);
  const weekStartDate = addDays(anchor, week * 7);
  slots.push({
    chore: "trash",
    start: weekStartDate,
    due: addDays(weekStartDate, 6),
    memberIndex: week % members,
  });

  const cycle = Math.floor(days / 14);
  const cycleStart = addDays(anchor, cycle * 14);
  CLEANING.forEach((chore, i) => {
    slots.push({
      chore,
      start: cycleStart,
      due: addDays(cycleStart, 13),
      memberIndex: (i + cycle) % members,
    });
  });

  // Offset by 2 so that the first month's fridges don't land on the person
  // who also has the first week's trash and the first kitchen.
  const month = monthIndex(date) - monthIndex(anchor);
  const monthStart = `${date.slice(0, 7)}-01`;
  slots.push({
    chore: "fridges",
    start: monthStart < anchor ? anchor : monthStart,
    due: lastDayOfMonth(date),
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
