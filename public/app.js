import { ALL_CLEAR, HOUSE, ICONS } from "./icons.js";

const EMAIL_KEY = "wg-email";
const RULES_KEY = "wg-rules-seen";
const $ = (id) => document.getElementById(id);

const STATUS = { done: "Done", due: "Due today", overdue: "Overdue", open: "To do" };

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

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Hi";
  if (h < 12) return "Good morning";
  if (h < 18) return "Hey";
  return "Good evening";
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
    action = `<div class="task-actions"><button class="button small" data-done="${esc(task.id)}">${ICONS.check} I've done it</button></div>`;
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
  $("switch").title = "Not you? Switch person";

  const mine = data.tasks.filter((t) => t.memberId === me.id);
  const others = data.tasks.filter((t) => t.memberId !== me.id);
  const open = mine.filter((t) => !t.doneAt);
  const late = open.filter((t) => t.status === "overdue");

  $("greeting").textContent = `${greeting()}, ${firstName()}`;
  $("headline").textContent = !data.started
    ? "Let's get the crew together."
    : late.length
      ? `${late.length === 1 ? "One job is" : `${late.length} jobs are`} overdue.`
      : open.length
        ? `You've got ${open.length === 1 ? "one job" : `${open.length} jobs`} this round.`
        : "You're all done for this round.";

  // Waiting room until the schedule starts.
  const missing = Math.max(0, data.maxMembers - data.members.length);
  $("waiting").hidden = data.started;
  $("seats").innerHTML =
    data.members.map((m) => avatar(m.name, m.id, "lg")).join("") +
    Array.from({ length: missing }, () => `<span class="seat">?</span>`).join("");
  $("waiting-text").textContent = missing
    ? `${data.members.length} of ${data.maxMembers} are in. Send them the link and the schedule starts as soon as everyone has joined.`
    : "Everyone's in!";

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
    $("progress-count").textContent = `${doneCount} of ${current.length} jobs done`;
    $("progress-text").textContent =
      ratio === 1
        ? "The whole flat is clean."
        : ratio >= 0.6
          ? "Nearly there."
          : ratio > 0
            ? "Good start."
            : "A fresh round has started.";
  }

  $("mine-wrap").hidden = !data.started;
  $("mine").innerHTML = mine.length
    ? mine.map(taskItem).join("")
    : `<li class="card empty">${ALL_CLEAR}Nothing on your list right now.</li>`;

  $("others-wrap").hidden = others.length === 0;
  $("others").innerHTML = others.map(taskItem).join("");

  $("upcoming-wrap").hidden = data.upcoming.length === 0;
  $("upcoming").innerHTML = data.upcoming
    .map(
      (u) => `<li><div class="ico">${ICONS[u.chore]}</div><div class="title">${esc(u.title)}</div>
      <div class="who">${avatar(u.memberName, data.members.find((m) => m.name === u.memberName)?.id ?? 0)} ${esc(u.memberName === me.name ? "You" : u.memberName)}</div>
      <div class="when">from ${fmt(u.start)}</div></li>`,
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
      (t) => `<li>${avatar(t.memberName, t.memberId)}<span class="what"><strong>${esc(t.memberName)}</strong> · ${esc(t.title.toLowerCase())}</span><span class="when">${fmt(t.due)}</span></li>`,
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
    if (known.me) {
      data = known;
    } else {
      if (known.members.length >= known.maxMembers) {
        throw new Error(`This WG already has ${known.maxMembers} people. Use the email you joined with.`);
      }
      if (!$("name").value.trim()) {
        $("name").focus();
        throw new Error("Looks like you're new here. What's your first name?");
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

$("start").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  if (!confirm("Start the schedule now? The jobs will be shared between the people who have joined so far.")) return;
  button.disabled = true;
  try {
    data = await api("/api/start", {});
    render();
  } catch (error) {
    alert(error.message);
  } finally {
    button.disabled = false;
  }
});

$("invite").addEventListener("click", async () => {
  const url = location.origin;
  const text = "Join our WG chore schedule. Just add your email:";
  try {
    if (navigator.share) {
      await navigator.share({ title: "WG Chores", text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      $("invite-label").textContent = "Link copied";
      setTimeout(() => ($("invite-label").textContent = "Invite them"), 2000);
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
    if (!confirm(`Remove ${target.dataset.name} from the WG? Their open jobs move to someone else.`)) return;
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
