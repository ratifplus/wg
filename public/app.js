const EMAIL_KEY = "wg-email";
const RULES_KEY = "wg-rules-seen";
const $ = (id) => document.getElementById(id);

const EMOJI = { trash: "🗑️", kitchen: "🍳", bathroom: "🛁", floors: "🧹", fridges: "🧊" };
const STATUS = { done: "Done ✓", due: "Due today", overdue: "Overdue", open: "To do" };

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
  const hue = (Number(id) * 137) % 360;
  return `<span class="avatar ${size}" style="--h:${hue}">${esc((name || "?").trim().charAt(0).toUpperCase())}</span>`;
}

function firstName() {
  return data.me.name.split(" ")[0];
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
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
    action = `<div class="task-actions"><button class="link" data-undo="${esc(task.id)}">Oops, not done yet</button></div>`;
  } else if (mine) {
    action = `<div class="task-actions"><button class="button done-btn" data-done="${esc(task.id)}">✓ I've done it</button></div>`;
  }
  const who = mine ? "You" : esc(task.memberName);
  return `<li class="task c-${task.chore}${task.doneAt ? " is-done" : ""}" data-task="${esc(task.id)}">
    <div class="task-icon">${EMOJI[task.chore] ?? "✨"}</div>
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
  $("switch").innerHTML = `${avatar(me.name, me.id)} ${esc(firstName())}`;
  $("switch").title = "Not you? Switch person";

  const mine = data.tasks.filter((t) => t.memberId === me.id);
  const others = data.tasks.filter((t) => t.memberId !== me.id);
  const open = mine.filter((t) => !t.doneAt);
  const late = open.filter((t) => t.status === "overdue");

  $("greeting").textContent = `${greeting()}, ${firstName()}!`;
  $("headline").textContent = !data.started
    ? "Let's get the crew together."
    : late.length
      ? `${late.length === 1 ? "One job is" : `${late.length} jobs are`} waiting on you 👀`
      : open.length
        ? `You've got ${open.length === 1 ? "one job" : `${open.length} jobs`} this round.`
        : "You're all done. Legend. 🎉";

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
      $("ring-fg").style.strokeDashoffset = String(314.16 * (1 - ratio));
    });
    $("progress-count").textContent = `${doneCount} of ${current.length} done`;
    $("progress-text").textContent =
      ratio === 1
        ? "Spotless. The WG thanks you all. ✨"
        : ratio >= 0.6
          ? "Nearly there, keep it going!"
          : ratio > 0
            ? "Good start. The flat is getting there."
            : "Fresh round, fresh start.";
  }

  $("mine-wrap").hidden = !data.started;
  $("mine").innerHTML = mine.length
    ? mine.map(taskItem).join("")
    : `<li class="card empty"><span class="big-emoji">🛋️</span>Nothing on your list. Put your feet up.</li>`;

  $("others-wrap").hidden = others.length === 0;
  $("others").innerHTML = others.map(taskItem).join("");

  $("upcoming-wrap").hidden = data.upcoming.length === 0;
  $("upcoming").innerHTML = data.upcoming
    .map(
      (u) => `<li><div class="emoji">${EMOJI[u.chore]}</div><div>${esc(u.title)}</div>
      <div class="who">${avatar(u.memberName, data.members.find((m) => m.name === u.memberName)?.id ?? 0)} ${esc(u.memberName === me.name ? "You" : u.memberName)}</div>
      <div class="when">from ${fmt(u.start)}</div></li>`,
    )
    .join("");

  $("members").innerHTML = data.members
    .map(
      (m) => `<li>${avatar(m.name, m.id, "lg")}
      <div class="info"><strong>${esc(m.name)}${m.id === me.id ? " (you)" : ""}</strong><span>${esc(m.email)}</span></div>
      <span class="score">${m.doneCount ? `⭐ ${m.doneCount}` : ""}</span>
      <button class="link" data-remove="${m.id}" data-name="${esc(m.name)}">Remove</button></li>`,
    )
    .join("");

  $("history-wrap").hidden = data.history.length === 0;
  $("history").innerHTML = data.history
    .map(
      (t) => `<li>${avatar(t.memberName, t.memberId)}<span class="what">${EMOJI[t.chore]} <strong>${esc(t.memberName)}</strong> · ${esc(t.title.toLowerCase())}</span><span class="when">${fmt(t.due)}</span></li>`,
    )
    .join("");

  if (justDone) {
    const card = document.querySelector(`[data-task="${CSS.escape(justDone)}"]`);
    card?.classList.add("pop");
  }
}

function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#ff6b4a", "#3fae8c", "#4aa3ff", "#e8b100", "#36c2d6", "#ef4b5f"];
  const layer = $("confetti");
  for (let i = 0; i < 70; i++) {
    const bit = document.createElement("span");
    bit.className = "bit";
    bit.style.left = `${Math.random() * 100}vw`;
    bit.style.background = colors[i % colors.length];
    bit.style.setProperty("--dx", `${(Math.random() - 0.5) * 200}px`);
    bit.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
    bit.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    bit.style.animationDelay = `${Math.random() * 0.3}s`;
    layer.append(bit);
    setTimeout(() => bit.remove(), 3500);
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
      $("invite").textContent = "✓ Link copied";
      setTimeout(() => ($("invite").textContent = "📨 Invite them"), 2000);
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
    if (target.dataset.done) confetti();
  } catch (error) {
    alert(error.message);
    target.disabled = false;
  }
});

/* ---------- start ---------- */

const firstVisit = !load(RULES_KEY);
if (firstVisit) show("rules");
refresh()
  .then(() => {
    if (firstVisit) show("rules");
  })
  .catch((error) => (firstVisit ? show("rules") : showJoin(error.message)));
