import { ALL_CLEAR, HOUSE, ICONS } from "./icons.js";

const EMAIL_KEY = "wg-email";
const RULES_KEY = "wg-rules-seen";
const $ = (id) => document.getElementById(id);

const STATUS = { done: "Done", due: "Due today", overdue: "Overdue", open: "Open" };

let email = load(EMAIL_KEY);
let data = null;

function load(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Private mode: nothing is remembered, which is fine.
  }
}

function esc(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

function fmt(date) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function daysUntil(date) {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${data.today}T00:00:00Z`)) / 86_400_000);
}

function dueText(task) {
  if (task.doneAt) {
    return `done ${new Date(task.doneAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  }
  const d = daysUntil(task.due);
  if (d < -1) return `${-d} days late`;
  if (d === -1) return "1 day late";
  if (d === 0) return "due today";
  if (d === 1) return "due tomorrow";
  if (d < 7) {
    return `due ${new Date(`${task.due}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" })}`;
  }
  return `due ${fmt(task.due)}`;
}

function avatar(name, id, size = "") {
  // Shades of the one blue, so people are told apart without extra colours.
  const lightness = [52, 32, 66, 42, 60][Number(id) % 5];
  return `<span class="avatar ${size}" style="--l:${lightness}%">${esc((name || "?").trim().charAt(0).toUpperCase())}</span>`;
}

function firstName() {
  return data.me.name.split(" ")[0];
}

async function api(path, body) {
  const res = await fetch(
    path,
    body
      ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, ...body }) }
      : undefined,
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong. Try again?");
  return json;
}

/* ---------- screens ---------- */

function show(screen) {
  $("rules").hidden = screen !== "rules";
  $("join").hidden = screen !== "join";
  $("app").hidden = screen !== "app";
  $("switch").hidden = screen !== "app";
  $("rules-open").hidden = screen === "rules";
  window.scrollTo({ top: 0 });
}

function showJoin(message) {
  show("join");
  $("join-error").hidden = !message;
  $("join-error").textContent = message ?? "";
}

async function refresh() {
  data = await api(`/api/state?email=${encodeURIComponent(email ?? "")}`);
  $("address").textContent = data.address ?? "";
  if (!data.me) showJoin();
  else render();
}

/* ---------- rendering ---------- */

function taskItem(task) {
  const mine = task.memberId === data.me.id;
  let action = "";
  if (mine && task.doneAt) {
    action = `<div class="task-actions"><button class="link" data-undo="${esc(task.id)}">Undo</button></div>`;
  } else if (mine) {
    action = `<div class="task-actions"><button class="button small" data-done="${esc(task.id)}">${ICONS.check} Mark done</button></div>`;
  }
  const who = mine ? "You" : esc(task.memberName);
  return `<li class="task${mine ? " mine" : ""}${task.doneAt ? " is-done" : ""}" data-task="${esc(task.id)}">
    <div class="task-icon">${task.doneAt ? ICONS.check : ICONS[task.chore]}</div>
    <div class="task-body">
      <div class="task-head">
        <div class="task-title">${esc(task.title)}</div>
        <span class="pill ${task.status}">${STATUS[task.status]}</span>
      </div>
      <div class="task-meta">${avatar(task.memberName, task.memberId)} ${who} · ${dueText(task)}</div>
      ${action}
    </div>
  </li>`;
}

function render(justDone) {
  show("app");
  const me = data.me;
  $("switch").innerHTML = `${avatar(me.name, me.id)}${esc(firstName())}`;
  $("switch").title = "Switch member";

  const mine = data.tasks.filter((t) => t.memberId === me.id);
  const others = data.tasks.filter((t) => t.memberId !== me.id);
  const open = mine.filter((t) => !t.doneAt);
  const late = open.filter((t) => t.status === "overdue");

  $("greeting").textContent = firstName();
  $("headline").textContent = !data.started
    ? "Waiting for members"
    : late.length
      ? `${late.length} overdue`
      : open.length
        ? `${open.length} open ${open.length === 1 ? "job" : "jobs"}`
        : "All done";

  // Waiting room until the schedule starts.
  const missing = Math.max(0, data.maxMembers - data.members.length);
  $("waiting").hidden = missing === 0;
  $("seats").innerHTML =
    data.members.map((m) => avatar(m.name, m.id, "lg")).join("") +
    Array.from({ length: missing }, () => `<span class="seat">?</span>`).join("");
  $("waiting-text").textContent = `${data.members.length} / ${data.maxMembers} joined`;

  // Progress across everyone's current jobs.
  const current = data.tasks;
  const doneCount = current.filter((t) => t.doneAt).length;
  $("progress").hidden = !data.started || current.length === 0;
  if (current.length) {
    const ratio = doneCount / current.length;
    requestAnimationFrame(() => {
      $("bar-fill").style.width = `${ratio * 100}%`;
    });
    $("progress-pct").textContent = `${Math.round(ratio * 100)}%`;
    $("progress-count").textContent = `${doneCount} / ${current.length} done`;
  }

  $("mine-wrap").hidden = !data.started;
  $("mine").innerHTML = mine.length
    ? mine.map(taskItem).join("")
    : `<li class="card empty">${ALL_CLEAR}No open jobs</li>`;

  $("others-wrap").hidden = others.length === 0;
  $("others").innerHTML = others.map(taskItem).join("");

  $("upcoming-wrap").hidden = data.upcoming.length === 0;
  $("upcoming").innerHTML = data.upcoming
    .map(
      (u) => `<li><div class="ico">${ICONS[u.chore]}</div><div class="title">${esc(u.title)}</div>
      <div class="who">${avatar(u.memberName, data.members.find((m) => m.name === u.memberName)?.id ?? 0)} ${esc(u.memberName === me.name ? "You" : u.memberName)}</div>
      <div class="when">${fmt(u.start)}</div></li>`,
    )
    .join("");

  $("members").innerHTML = data.members
    .map(
      (m) => `<li>${avatar(m.name, m.id, "lg")}
      <div class="info"><strong>${esc(m.name)}${m.id === me.id ? " (you)" : ""}</strong><span>${esc(m.email)}</span></div>
      ${m.doneCount ? `<span class="score">${m.doneCount} done</span>` : ""}
      <button class="link" data-remove="${m.id}" data-name="${esc(m.name)}">Remove</button></li>`,
    )
    .join("");

  $("history-wrap").hidden = data.history.length === 0;
  $("history").innerHTML = data.history
    .map(
      (t) => `<li>${avatar(t.memberName, t.memberId)}<span class="what"><strong>${esc(t.memberName)}</strong> · ${esc(t.title)}</span><span class="when">${fmt(t.due)}</span></li>`,
    )
    .join("");

  if (justDone) {
    const card = document.querySelector(`[data-task="${CSS.escape(justDone)}"]`);
    card?.classList.add("pop");
  }
}

/* ---------- events ---------- */

$("rules-close").addEventListener("click", () => {
  store(RULES_KEY, "1");
  if (data?.me) render();
  else showJoin();
});

$("rules-open").addEventListener("click", () => show("rules"));

$("join-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter ?? event.target.querySelector("button");
  button.disabled = true;
  try {
    email = $("email").value.trim().toLowerCase();
    const known = await api(`/api/state?email=${encodeURIComponent(email)}`);
    $("address").textContent = known.address ?? "";
    if (known.me) {
      data = known;
    } else {
      if (known.members.length >= known.maxMembers) {
        throw new Error("WG is full. Use a registered email.");
      }
      if (!$("name").value.trim()) {
        $("name").focus();
        throw new Error("New member: first name required.");
      }
      data = await api("/api/join", { name: $("name").value.trim() });
    }
    store(EMAIL_KEY, email);
    render();
  } catch (error) {
    $("join-error").hidden = false;
    $("join-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("switch").addEventListener("click", () => {
  email = null;
  store(EMAIL_KEY, null);
  $("email").value = "";
  $("name").value = "";
  showJoin();
});

$("invite").addEventListener("click", async () => {
  const url = location.origin;
  const text = "WG Chores";
  try {
    if (navigator.share) {
      await navigator.share({ title: "WG Chores", text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      $("invite-label").textContent = "Copied";
      setTimeout(() => ($("invite-label").textContent = "Invite"), 2000);
    }
  } catch {
    // Share sheet dismissed.
  }
});

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-done],[data-undo],[data-remove]");
  if (!target) return;
  let path;
  if (target.dataset.done) path = `/api/tasks/${encodeURIComponent(target.dataset.done)}/done`;
  else if (target.dataset.undo) path = `/api/tasks/${encodeURIComponent(target.dataset.undo)}/undo`;
  else {
    if (!confirm(`Remove ${target.dataset.name}? Open jobs will be reassigned.`)) return;
    path = `/api/members/${target.dataset.remove}/remove`;
  }
  target.disabled = true;
  try {
    data = await api(path, {});
    if (!data.me) {
      store(EMAIL_KEY, null);
      showJoin();
      return;
    }
    render(target.dataset.done);
  } catch (error) {
    alert(error.message);
    target.disabled = false;
  }
});

/* ---------- start ---------- */

for (const el of document.querySelectorAll("[data-icon]")) el.innerHTML = ICONS[el.dataset.icon];
$("house").innerHTML = HOUSE;

const firstVisit = !load(RULES_KEY);
if (firstVisit) show("rules");
refresh()
  .then(() => {
    if (firstVisit) show("rules");
  })
  .catch((error) => (firstVisit ? show("rules") : showJoin(error.message)));

// Keep everyone's view current: re-sync when the app comes back to the
// foreground and every 30 seconds while it's open on the dashboard.
async function sync() {
  if (document.hidden || $("app").hidden || !email) return;
  try {
    data = await api(`/api/state?email=${encodeURIComponent(email)}`);
    if (data.me) render();
  } catch {
    // Offline for a moment; the next sync catches up.
  }
}
document.addEventListener("visibilitychange", sync);
setInterval(sync, 30_000);
