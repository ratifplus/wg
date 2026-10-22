import { CHORES, type ChoreId, type ReminderKind } from "./schedule";

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
  const dueText = formatDate(due);
  const subject =
    kind === "assigned"
      ? `Your turn: ${title}`
      : kind === "due"
        ? `Due today: ${title}`
        : `Reminder: ${title} is overdue`;
  const lead =
    kind === "assigned"
      ? `It's your turn to <strong>${escapeHtml(title.toLowerCase())}</strong>. Please get it done by ${dueText}.`
      : kind === "due"
        ? `<strong>${escapeHtml(title)}</strong> is due today.`
        : `<strong>${escapeHtml(title)}</strong> was due on ${dueText} and hasn't been marked as done yet. You'll get this reminder every 2 days until it is.`;
  const leadText = lead.replace(/<[^>]+>/g, "");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f8fc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0d1530">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px;border:1px solid #e4e8f1">
<p style="margin:0 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#5d6680">WG chores</p>
<h1 style="margin:0 0 16px;font-size:22px">Hi ${escapeHtml(name)},</h1>
<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${lead}</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#5d6680">${escapeHtml(detail)}</p>
<a href="${escapeHtml(doneUrl)}" style="display:inline-block;background:#1f4dff;color:#ffffff;text-decoration:none;font-weight:600;padding:14px 22px;border-radius:12px;font-size:16px">I've done it</a>
<p style="margin:24px 0 0;font-size:14px;line-height:1.5;color:#5d6680">Everyone in the WG can see who has finished their job. <a href="${escapeHtml(appUrl)}" style="color:#1f4dff">Open the schedule</a></p>
</div></body></html>`;

  const text = `Hi ${name},

${leadText}

${detail}

When you're done, mark it here: ${doneUrl}

Schedule: ${appUrl}
`;

  return { subject, html, text };
}
