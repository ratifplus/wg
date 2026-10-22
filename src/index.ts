import { escapeHtml, formatDate, reminderEmail } from "./email";
import {
  CHORES,
  type ChoreId,
  nextSlots,
  reminderFor,
  slotsOn,
  todayIn,
  weekStart,
} from "./schedule";

export interface Env {
  DB: D1Database;
  EMAIL: SendEmail;
  ASSETS: Fetcher;
  MAIL_FROM: string;
  TIME_ZONE: string;
  MAX_MEMBERS: string;
  ADDRESS?: string;
}

interface Member {
  id: number;
  email: string;
  name: string;
  position: number;
}

interface Task {
  id: string;
  chore: ChoreId;
  start: string;
  due: string;
  member_id: number | null;
  done_at: string | null;
  notified_on: string | null;
  due_notified_on: string | null;
  last_reminder_on: string | null;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL,
    joined_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    chore TEXT NOT NULL,
    start TEXT NOT NULL,
    due TEXT NOT NULL,
    member_id INTEGER,
    done_at TEXT,
    notified_on TEXT,
    due_notified_on TEXT,
    last_reminder_on TEXT
  )`,
];

let schemaReady = false;

async function ensureSchema(db: D1Database) {
  if (schemaReady) return;
  await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
  schemaReady = true;
}

async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  return row?.value ?? null;
}

async function setSetting(db: D1Database, key: string, value: string) {
  await db
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key, value)
    .run();
}

// The key that signs the "I've done it" links in emails. Generated once and
// kept in the database, so there is no secret to configure.
async function signingKey(db: D1Database): Promise<CryptoKey> {
  let secret = await getSetting(db, "secret");
  if (!secret) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    secret = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    await db
      .prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('secret', ?)")
      .bind(secret)
      .run();
    secret = (await getSetting(db, "secret"))!;
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(db: D1Database, taskId: string): Promise<string> {
  const key = await signingKey(db);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(taskId));
  return btoa(String.fromCharCode(...new Uint8Array(mac)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function verify(db: D1Database, taskId: string, signature: string): Promise<boolean> {
  const expected = await sign(db, taskId);
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

async function listMembers(db: D1Database): Promise<Member[]> {
  const { results } = await db
    .prepare("SELECT id, email, name, position FROM members ORDER BY position, id")
    .all<Member>();
  return results;
}

function normaliseEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

async function memberByEmail(db: D1Database, email: unknown): Promise<Member | null> {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;
  return db
    .prepare("SELECT id, email, name, position FROM members WHERE email = ?")
    .bind(normalised)
    .first<Member>();
}

/**
 * Create the tasks for every chore period that contains `today`, and hand
 * open tasks of anyone who has left to whoever the rotation now gives them to.
 */
async function ensureTasks(env: Env, today: string): Promise<boolean> {
  const db = env.DB;
  const anchor = await getSetting(db, "anchor");
  if (!anchor) return false;
  const members = await listMembers(db);
  if (members.length === 0) return false;

  const ids = new Set(members.map((m) => m.id));
  const statements: D1PreparedStatement[] = [];
  for (const slot of slotsOn(anchor, today, members.length)) {
    const id = `${slot.chore}:${slot.start}`;
    const memberId = members[slot.memberIndex].id;
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO tasks (id, chore, start, due, member_id) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(id, slot.chore, slot.start, slot.due, memberId),
    );
    statements.push(
      db
        .prepare(
          `UPDATE tasks SET member_id = ?, notified_on = NULL, due_notified_on = NULL, last_reminder_on = NULL
           WHERE id = ? AND done_at IS NULL AND (member_id IS NULL OR member_id NOT IN (${[...ids].join(",")}))`,
        )
        .bind(memberId, id),
    );
  }
  // Overdue jobs from earlier periods belonging to someone who has left.
  statements.push(
    db.prepare(
      `DELETE FROM tasks WHERE done_at IS NULL AND due < ?
       AND (member_id IS NULL OR member_id NOT IN (${[...ids].join(",")}))`,
    ).bind(today),
  );
  await db.batch(statements);
  return true;
}

async function appUrl(env: Env): Promise<string> {
  return (await getSetting(env.DB, "origin")) ?? "";
}

/** Create today's tasks and send every email that is due. Safe to run repeatedly. */
async function tick(env: Env) {
  await ensureSchema(env.DB);
  const today = todayIn(env.TIME_ZONE);
  if (!(await ensureTasks(env, today))) return;

  const origin = await appUrl(env);
  const { results } = await env.DB.prepare(
    `SELECT t.*, m.email, m.name FROM tasks t JOIN members m ON m.id = t.member_id
     WHERE t.done_at IS NULL AND t.start <= ?`,
  )
    .bind(today)
    .all<Task & { email: string; name: string }>();

  for (const task of results) {
    const kind = reminderFor(
      {
        start: task.start,
        due: task.due,
        done: false,
        notifiedOn: task.notified_on,
        dueNotifiedOn: task.due_notified_on,
        lastReminderOn: task.last_reminder_on,
      },
      today,
    );
    if (!kind) continue;

    const signature = await sign(env.DB, task.id);
    const message = reminderEmail({
      kind,
      name: task.name,
      chore: task.chore,
      due: task.due,
      doneUrl: `${origin}/done?t=${encodeURIComponent(task.id)}&s=${signature}`,
      appUrl: `${origin}/`,
    });

    try {
      await env.EMAIL.send({
        to: task.email,
        from: { email: env.MAIL_FROM, name: "WG chores" },
        subject: message.subject,
        html: message.html,
        text: message.text,
      });
    } catch (error) {
      console.error(`Email for ${task.id} to ${task.email} failed`, error);
      continue;
    }

    const column =
      kind === "assigned" ? "notified_on" : kind === "due" ? "due_notified_on" : "last_reminder_on";
    await env.DB.prepare(`UPDATE tasks SET ${column} = ? WHERE id = ?`).bind(today, task.id).run();
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function taskView(task: Task, members: Member[], today: string) {
  const member = members.find((m) => m.id === task.member_id);
  return {
    id: task.id,
    chore: task.chore,
    title: CHORES[task.chore].title,
    detail: CHORES[task.chore].detail,
    every: CHORES[task.chore].every,
    start: task.start,
    due: task.due,
    memberId: task.member_id,
    memberName: member?.name ?? "Former member",
    doneAt: task.done_at,
    status: task.done_at ? "done" : today > task.due ? "overdue" : today === task.due ? "due" : "open",
  };
}

async function state(env: Env, email: unknown) {
  const db = env.DB;
  const today = todayIn(env.TIME_ZONE);
  await ensureTasks(env, today);
  const members = await listMembers(db);
  const anchor = await getSetting(db, "anchor");
  const me = members.find((m) => m.email === normaliseEmail(email)) ?? null;

  const { results: current } = await db
    .prepare(
      "SELECT * FROM tasks WHERE (start <= ?1 AND due >= ?1) OR (done_at IS NULL AND due < ?1) ORDER BY due, chore",
    )
    .bind(today)
    .all<Task>();
  const { results: history } = await db
    .prepare(
      "SELECT * FROM tasks WHERE due < ? AND done_at IS NOT NULL ORDER BY due DESC, chore LIMIT 30",
    )
    .bind(today)
    .all<Task>();

  const { results: doneCounts } = await db
    .prepare("SELECT member_id, COUNT(*) AS count FROM tasks WHERE done_at IS NOT NULL GROUP BY member_id")
    .all<{ member_id: number; count: number }>();

  const upcoming =
    anchor && members.length
      ? nextSlots(anchor, today, members.length).map((slot) => ({
          chore: slot.chore,
          title: CHORES[slot.chore].title,
          start: slot.start,
          due: slot.due,
          memberName: members[slot.memberIndex].name,
        }))
      : [];

  return {
    today,
    address: env.ADDRESS ?? "",
    started: Boolean(anchor),
    maxMembers: Number(env.MAX_MEMBERS) || 3,
    me,
    members: members.map(({ id, name, email }) => ({
      id,
      name,
      email,
      doneCount: doneCounts.find((d) => d.member_id === id)?.count ?? 0,
    })),
    tasks: current.map((t) => taskView(t, members, today)),
    upcoming,
    history: history.map((t) => taskView(t, members, today)),
  };
}

async function startSchedule(env: Env) {
  const today = todayIn(env.TIME_ZONE);
  await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('anchor', ?)")
    .bind(weekStart(today))
    .run();
}

async function markDone(db: D1Database, taskId: string): Promise<Task | null> {
  await db
    .prepare("UPDATE tasks SET done_at = ? WHERE id = ? AND done_at IS NULL")
    .bind(new Date().toISOString(), taskId)
    .run();
  return db.prepare("SELECT * FROM tasks WHERE id = ?").bind(taskId).first<Task>();
}

async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const db = env.DB;
  const path = url.pathname;

  if (path === "/api/state" && request.method === "GET") {
    return json(await state(env, url.searchParams.get("email")));
  }

  if (request.method !== "POST") return json({ error: "Not found." }, 404);
  const body = await readJson(request);

  if (path === "/api/join") {
    const email = normaliseEmail(body.email);
    if (!email) return json({ error: "Invalid email." }, 400);
    const existing = await memberByEmail(db, email);
    if (existing) return json(await state(env, email));

    const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
    if (!name) return json({ error: "First name required." }, 400);
    const members = await listMembers(db);
    const max = Number(env.MAX_MEMBERS) || 3;
    if (members.length >= max) {
      return json(
        { error: "WG is full. Use a registered email." },
        403,
      );
    }
    const position = members.reduce((p, m) => Math.max(p, m.position + 1), 0);
    await db
      .prepare("INSERT INTO members (email, name, position, joined_at) VALUES (?, ?, ?, ?)")
      .bind(email, name, position, new Date().toISOString())
      .run();
    if (members.length + 1 >= max) await startSchedule(env);
    ctx.waitUntil(tick(env));
    return json(await state(env, email));
  }

  const me = await memberByEmail(db, body.email);
  if (!me) return json({ error: "Sign in required." }, 401);

  if (path === "/api/start") {
    await startSchedule(env);
    ctx.waitUntil(tick(env));
    return json(await state(env, me.email));
  }

  const taskAction = path.match(/^\/api\/tasks\/([^/]+)\/(done|undo)$/);
  if (taskAction) {
    const id = decodeURIComponent(taskAction[1]);
    const task = await db.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Task>();
    if (!task) return json({ error: "Job not found." }, 404);
    if (task.member_id !== me.id) return json({ error: "Only the assigned member can change this job." }, 403);
    if (taskAction[2] === "done") await markDone(db, id);
    else await db.prepare("UPDATE tasks SET done_at = NULL WHERE id = ?").bind(id).run();
    return json(await state(env, me.email));
  }

  const remove = path.match(/^\/api\/members\/(\d+)\/remove$/);
  if (remove) {
    await db.prepare("DELETE FROM members WHERE id = ?").bind(Number(remove[1])).run();
    const remaining = await listMembers(db);
    if (remaining.length === 0) await db.prepare("DELETE FROM settings WHERE key = 'anchor'").run();
    ctx.waitUntil(tick(env));
    return json(await state(env, me.email));
  }

  return json({ error: "Not found." }, 404);
}

// Same artwork as ALL_CLEAR in public/icons.js.
const ALL_CLEAR = `<svg viewBox="0 0 160 120" width="160" height="120" aria-hidden="true" class="illo">
<circle cx="80" cy="60" r="38" fill="var(--blue-100)"/><circle cx="80" cy="60" r="26" fill="var(--blue)"/>
<path d="M68 60.5l8 8 16-17" fill="none" stroke="var(--surface)" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M28 34l8 5M132 34l-8 5M24 78h10M126 78h10M80 6v10" stroke="var(--blue-300)" stroke-width="4" stroke-linecap="round"/></svg>`;

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="/styles.css"></head>
<body><main class="shell narrow"><div class="card confirm">${body}</div></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

// The "I've done it" button in emails lands here. GET shows a confirmation
// button and only the POST marks the job done, so mail scanners that open
// links in advance can't tick it off on someone's behalf.
async function handleDone(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const params = request.method === "POST" ? new URLSearchParams(await request.text()) : url.searchParams;
  const id = params.get("t") ?? "";
  const signature = params.get("s") ?? "";
  if (!id || !signature || !(await verify(env.DB, id, signature))) {
    return page("Link not valid", `<h1>Invalid link</h1><a class="button" href="/">Open schedule</a>`, 400);
  }
  const task = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?").bind(id).first<Task>();
  if (!task) {
    return page("Job not found", `<h1>Job not found</h1><a class="button" href="/">Open schedule</a>`, 404);
  }
  const { title } = CHORES[task.chore];

  if (request.method === "POST" || task.done_at) {
    await markDone(env.DB, id);
    return page(
      "Done",
      `${ALL_CLEAR}<h1>Marked done</h1><p class="muted">${escapeHtml(title)}</p><a class="button" href="/">Open schedule</a>`,
    );
  }

  return page(
    title,
    `<h1>${escapeHtml(title)}</h1><p class="muted">Due ${escapeHtml(formatDate(task.due))}</p>
<form method="post" action="/done"><input type="hidden" name="t" value="${escapeHtml(id)}"><input type="hidden" name="s" value="${escapeHtml(signature)}">
<button class="button big" type="submit">Confirm done</button></form>`,
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    await ensureSchema(env.DB);

    // Remember where the app is served from, for the links in emails sent by cron.
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      if ((await getSetting(env.DB, "origin")) !== url.origin) {
        ctx.waitUntil(setSetting(env.DB, "origin", url.origin));
      }
    } else if (!(await getSetting(env.DB, "origin"))) {
      await setSetting(env.DB, "origin", url.origin);
    }

    if (url.pathname === "/done") return handleDone(request, env);
    if (url.pathname.startsWith("/api/")) return handleApi(request, env, ctx);
    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(tick(env));
  },
} satisfies ExportedHandler<Env>;
