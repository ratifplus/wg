import { CHORES, type ChoreId, type ReminderKind } from "./schedule";

export const EMOJI: Record<ChoreId, string> = {
  trash: "🗑️",
  kitchen: "🍳",
  bathroom: "🛁",
  floors: "🧹",
  fridges: "🧊",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

interface ReminderEmail {
  kind: ReminderKind;
  name: string;
  chore: ChoreId;
  due: string;
  doneUrl: string;
  appUrl: string;
}

export function reminderEmail({ kind, name, chore, due, doneUrl, appUrl }: ReminderEmail) {
  const { title, detail } = CHORES[chore];
  const emoji = EMOJI[chore];
  const dueText = formatDate(due);
  const subject =
    kind === "assigned"
      ? `${emoji} Your turn: ${title}`
      : kind === "due"
        ? `${emoji} Due today: ${title}`
        : `⏰ Reminder: ${title} is overdue`;
  const lead =
    kind === "assigned"
      ? `It's your turn to <strong>${escapeHtml(title.toLowerCase())}</strong>. Please get it done by ${dueText}.`
      : kind === "due"
        ? `<strong>${escapeHtml(title)}</strong> is due today.`
        : `<strong>${escapeHtml(title)}</strong> was due on ${dueText} and hasn't been marked as done yet. You'll get this reminder every 2 days until it is.`;
  const leadText = lead.replace(/<[^>]+>/g, "");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#fff6e9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#2b2118">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:24px;padding:28px">
<p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#7a6a5c">WG chores</p>
<div style="font-size:40px;line-height:1;margin:0 0 12px">${emoji}</div>
<h1 style="margin:0 0 16px;font-size:22px">Hi ${escapeHtml(name)},</h1>
<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${lead}</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#7a6a5c">${escapeHtml(detail)}</p>
<a href="${escapeHtml(doneUrl)}" style="display:inline-block;background:#ff6b4a;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:999px;font-size:16px">✓ I've done it</a>
<p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#7a6a5c">Everyone in the WG can see who has finished their job. <a href="${escapeHtml(appUrl)}" style="color:#ff6b4a">Open the schedule</a></p>
</div></body></html>`;

  const text = `Hi ${name},

${leadText}

${detail}

When you're done, mark it here: ${doneUrl}

Schedule: ${appUrl}
`;

  return { subject, html, text };
}
