const STORAGE_KEY = "wg-email";
const $ = (id) => document.getElementById(id);

let email = load();
let data = null;

function load() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function save(value) {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private mode: the email is just asked again next time.
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

const STATUS = { done: "Done", due: "Due today", overdue: "Overdue", open: "To do" };

async function api(path, body) {
  const res = await fetch(path, body
    ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, ...body }) }
    : undefined);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Something went wrong.");
  return json;
}

async function refresh() {
  data = await api(`/api/state?email=${encodeURIComponent(email ?? "")}`);
  if (!data.me) {
    showJoin();
    return;
  }
  render();
}

function showJoin(message) {
  $("app").hidden = true;
  $("switch").hidden = true;
  $("join").hidden = false;
  $("join-error").hidden = !message;
  $("join-error").textContent = message ?? "";
  $("email").focus();
}

function taskItem(task) {
  const mine = task.memberId === data.me.id;
  const doneText = task.doneAt
    ? ` · done ${new Date(task.doneAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
    : "";
  const action = !mine
    ? ""
    : task.doneAt
      ? `<div class="task-actions"><button class="link" data-undo="${esc(task.id)}">Undo</button></div>`
      : `<div class="task-actions"><button class="button" data-done="${esc(task.id)}">Mark as done</button></div>`;
  return `<li class="task${mine ? " mine" : ""}">
    <div class="task-head">
      <div>
        <div class="task-title">${esc(task.title)}</div>
        <div class="task-meta">${mine ? "<strong>You</strong>" : esc(task.memberName)} · due ${fmt(task.due)}${doneText}</div>
      </div>
      <span class="pill ${task.status}">${STATUS[task.status]}</span>
    </div>
    ${action}
  </li>`;
}

function render() {
  $("join").hidden = true;
  $("app").hidden = false;
  $("switch").hidden = false;
  $("switch").textContent = `${data.me.name} · not you?`;

  const missing = data.maxMembers - data.members.length;
  $("waiting").hidden = data.started;
  $("waiting-text").textContent = missing > 0
    ? `${data.members.length} of ${data.maxMembers} roommates have joined. Waiting for ${missing} more.`
    : "";

  const open = data.tasks.filter((t) => t.memberId === data.me.id && !t.doneAt);
  $("mine").hidden = !data.started;
  $("mine").innerHTML = open.length
    ? `<div class="card"><h1>You have ${open.length} job${open.length > 1 ? "s" : ""} to do</h1><p class="muted">${open.map((t) => esc(t.title)).join(", ")}.</p></div>`
    : `<div class="card"><h1>You're all done 🎉</h1><p class="muted">Nothing on your list right now.</p></div>`;

  $("tasks").innerHTML = data.tasks.length
    ? data.tasks.map(taskItem).join("")
    : `<li class="muted">No jobs yet. They appear once the schedule starts.</li>`;

  $("upcoming").innerHTML = data.upcoming.length
    ? data.upcoming
        .map((u) => `<li><span>${esc(u.title)}</span><span class="sub">${esc(u.memberName)} · from ${fmt(u.start)}</span></li>`)
        .join("")
    : `<li class="muted">Nothing scheduled yet.</li>`;

  $("members").innerHTML = data.members
    .map((m) => `<li><span>${esc(m.name)}${m.id === data.me.id ? " (you)" : ""}<br><span class="sub">${esc(m.email)}</span></span>
      <button class="link danger" data-remove="${m.id}" data-name="${esc(m.name)}">Remove</button></li>`)
    .join("");

  $("history").innerHTML = data.history.length
    ? data.history
        .map((t) => `<li><span>${esc(t.title)}</span><span class="sub">${esc(t.memberName)} · ${fmt(t.due)}</span></li>`)
        .join("")
    : `<li class="muted">Nothing yet.</li>`;
}

$("join-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    email = $("email").value.trim().toLowerCase();
    const known = await api(`/api/state?email=${encodeURIComponent(email)}`);
    if (known.me) {
      data = known;
    } else if ($("name-field").hidden) {
      if (known.members.length >= known.maxMembers) {
        throw new Error(`This WG already has ${known.maxMembers} people. Use the email you joined with.`);
      }
      $("name-field").hidden = false;
      $("name").required = true;
      $("name").focus();
      $("join-error").hidden = true;
      return;
    } else {
      data = await api("/api/join", { name: $("name").value });
    }
    save(email);
    render();
  } catch (error) {
    $("join-error").hidden = false;
    $("join-error").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("email").addEventListener("input", () => {
  $("name-field").hidden = true;
  $("name").required = false;
});

$("switch").addEventListener("click", () => {
  email = null;
  save(null);
  $("email").value = "";
  $("name-field").hidden = true;
  showJoin();
});

$("start").addEventListener("click", async (event) => {
  event.target.disabled = true;
  try {
    data = await api("/api/start", {});
    render();
  } catch (error) {
    alert(error.message);
  } finally {
    event.target.disabled = false;
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
      save(null);
      showJoin();
    } else render();
  } catch (error) {
    alert(error.message);
    target.disabled = false;
  }
});

refresh().catch((error) => showJoin(error.message));
