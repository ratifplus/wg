import { CHORES, type ChoreId, type ReminderKind } from "./schedule";
import { formatDate } from "./email";

// WhatsApp through CallMeBot: each person activates it once from their own
// WhatsApp and gets a personal API key, then one GET request sends a message.
const API = "https://api.callmebot.com/whatsapp.php";

export function normalisePhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let phone = value.replace(/[\s()./-]/g, "");
  if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export function normaliseKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return /^[A-Za-z0-9]{3,32}$/.test(key) ? key : null;
}

export async function sendWhatsApp(phone: string, apikey: string, text: string): Promise<void> {
  const url = `${API}?phone=${encodeURIComponent(phone)}&apikey=${encodeURIComponent(apikey)}&text=${encodeURIComponent(text)}`;
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error("CallMeBot not reachable. Try again later.");
  }
  const body = (await response.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  // CallMeBot answers with a short HTML page: "queued" on success, an error
  // text (wrong key, number not activated, ...) otherwise.
  const failed = /error|invalid|not (?:valid|allowed|activated)|wrong/i.test(body) && !/queued/i.test(body);
  if (!response.ok || failed) {
    throw new Error(body.slice(0, 160) || `HTTP ${response.status}`);
  }
}

interface ReminderText {
  kind: ReminderKind;
  chore: ChoreId;
  due: string;
  doneUrl: string;
}

export function reminderText({ kind, chore, due, doneUrl }: ReminderText): string {
  const { title, detail } = CHORES[chore];
  const date = formatDate(due);
  const status =
    kind === "assigned" ? `Due ${date}` : kind === "due" ? `Due today, ${date}` : `Overdue since ${date}`;
  const note = kind === "overdue" ? "\nReminder every 2 days until marked done." : "";
  return `*WG Chores · ${title}*\n${status}\n${detail}${note}\n\nMark done: ${doneUrl}`;
}
