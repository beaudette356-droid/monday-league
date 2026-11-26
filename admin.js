import {
  collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, deleteDoc, runTransaction, serverTimestamp
} from "./firebase.js";
import {
  db, LEAGUE, esc, safeUrl, fmtDate, todayIso, initials, slotId,
  toast, friendlyError, requireMember, wireSignOut
} from "./common.js";

const $ = (id) => document.getElementById(id);
const panel = $("panel");
const CHIPS = ["#bfe0c9", "#f3e1b3", "#cfe3f0", "#f6cfc4"];
const MAX = LEAGUE.maxPerBay;
const state = {
  tab: "players", q: "", players: [], weeks: [], slots: {}, admins: [],
  waitlist: [], broadcasts: [], announcement: null, annDraft: null, mailDraft: { subject: "", body: "" },
  editing: null, draft: {}, bookWeek: null, armed: null, pending: false, loaded: { p: false, w: false, s: false, a: false }
};

wireSignOut();
const { user } = await requireMember({ adminOnly: true });

onSnapshot(collection(db, "players"), (snap) => {
  state.players = snap.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  state.loaded.p = true; refresh();
}, fail);
onSnapshot(query(collection(db, "weeks"), orderBy("date")), (snap) => {
  state.weeks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  state.loaded.w = true; refresh();
}, fail);
onSnapshot(collection(db, "slots"), (snap) => {
  const next = {}; snap.forEach((d) => { next[d.id] = d.data(); });
  state.slots = next; state.loaded.s = true; refresh();
}, fail);
onSnapshot(collection(db, "admins"), (snap) => {
  state.admins = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  state.loaded.a = true; refresh();
}, fail);

onSnapshot(collection(db, "waitlist"), (snap) => {
  state.waitlist = snap.docs.map((d) => ({ id: d.id, ...d.data() })); refresh();
}, () => {});
onSnapshot(query(collection(db, "broadcasts"), orderBy("createdAt", "desc")), (snap) => {
  state.broadcasts = snap.docs.map((d) => ({ id: d.id, ...d.data() })); refresh();
}, () => {});
onSnapshot(doc(db, "config", "announcement"), (snap) => {
  state.announcement = snap.exists() ? snap.data() : null; refresh();
}, () => {});

function fail(err) { toast(friendlyError(err), "error"); }

document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
  state.tab = t.dataset.tab; state.editing = null; state.armed = null; state.annDraft = null;
  document.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", String(x === t)));
  render();
}));

// Don't wipe a field someone is typing in when live data arrives.
function refresh() {
  const a = document.activeElement;
  if (a && panel.contains(a) && a.matches("input, textarea, select")) { state.pending = true; return; }
  render();
}
panel.addEventListener("focusout", () => setTimeout(() => {
  if (state.pending && !(document.activeElement && panel.contains(document.activeElement) && document.activeElement.matches("input, textarea, select"))) {
    state.pending = false; render();
  }
}, 0));

// ── helpers ──
const nameOf = (uid) => (state.players.find((p) => p.uid === uid) || {}).name || "Player";
function roster(date, slot, bay) {
  const s = state.slots[slotId(date, slot, bay)];
  return s && Array.isArray(s.uids) ? s.uids.map((uid) => ({ uid, name: (s.names && s.names[uid]) || nameOf(uid) })) : [];
}
function bookingOf(uid, date) {
  for (const s of LEAGUE.slots) for (const b of LEAGUE.bays) if (roster(date, s.id, b).some((p) => p.uid === uid)) return "Bay " + b + " · " + s.time;
  return "";
}
function nextWeek() {
  const t = todayIso();
  return state.weeks.find((w) => w.date >= t) || state.weeks[state.weeks.length - 1] || null;
}
function joined(p) {
  const ts = p.createdAt && typeof p.createdAt.toDate === "function" ? p.createdAt.toDate() : null;
  return ts ? ts.toLocaleDateString("en-CA", { month: "short", day: "numeric" }) : "";
}
function arm(key, btn, label) {
  if (state.armed === key) return true;
  state.armed = key; btn.textContent = label; btn.classList.add("armed");
  setTimeout(() => { if (state.armed === key) { state.armed = null; render(); } }, 4000);
  return false;
}

function render() {
  const L = state.loaded;
  if (!(L.p && L.w && L.s && L.a)) return;
  renderKpis();
  ({ players: renderPlayers, courses: renderCourses, bookings: renderBookings, messages: renderMessages, settings: renderSettings })[state.tab]();
}

function renderKpis() {
  const nw = nextWeek();
  let booked = 0;
  if (nw) for (const s of LEAGUE.slots) for (const b of LEAGUE.bays) booked += roster(nw.date, s.id, b).length;
  const cap = LEAGUE.slots.length * LEAGUE.bays.length * MAX;
  const set = state.weeks.filter((w) => w.course).length;
  const k = [
    ["Players", state.players.length],
    [nw ? "Booked " + fmtDate(nw.date, { month: "short", day: "numeric" }) : "Booked", booked + " of " + cap],
    ["Courses set", set + " of " + state.weeks.length]
  ];
  $("kpis").innerHTML = k.map(([a, b]) => '<div class="kpi"><span>' + esc(a) + "</span><b>" + esc(b) + "</b></div>").join("");
}

// ── Players ──
function renderPlayers() {
  panel.innerHTML =
    '<section class="panel rise"><div class="panel-bar">' +
      '<label class="search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5b6b62" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input type="search" id="q" aria-label="Search players" placeholder="Search name, email or phone" value="' + esc(state.q) + '"></label>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-outline btn-sm" id="copy-emails">Copy all emails</button><button type="button" class="btn btn-dark btn-sm" id="csv">Download CSV</button></div>' +
    '</div><div class="table-scroll"><table class="data"><thead><tr><th>Player</th><th>Email</th><th>Phone</th><th>Joined</th><th>Next Monday</th><th>Account</th></tr></thead><tbody id="rows"></tbody></table></div>' +
    '<p id="none" class="muted hidden" style="margin:0;padding:24px 20px">No players match that search.</p>' +
    '<p class="small muted" style="margin:0;padding:12px 20px 16px">Removing a player deletes their league profile and bookings. Their login stays until you delete it in Firebase › Authentication.</p></section>';
  $("q").addEventListener("input", (e) => { state.q = e.target.value; renderRows(); });
  $("copy-emails").addEventListener("click", async () => {
    const list = state.players.map((p) => p.email).filter(Boolean).join(", ");
    try { await navigator.clipboard.writeText(list); toast("Copied " + state.players.length + " emails."); }
    catch { toast("Couldn't copy. Use Download CSV instead.", "error"); }
  });
  $("csv").addEventListener("click", downloadCsv);
  renderRows();
}

function renderRows() {
  const nw = nextWeek();
  const q = state.q.trim().toLowerCase();
  const list = state.players.filter((p) => !q || [p.name, p.email, p.phone].join(" ").toLowerCase().includes(q));
  $("rows").innerHTML = list.map((p, i) => {
    const tel = String(p.phone || "").replace(/[^0-9+]/g, "");
    return "<tr><td><span class=\"person\"><span class=\"avatar\" style=\"background:" + CHIPS[i % 4] + "\">" + esc(initials(p.name)) + "</span>" + esc(p.name) + "</span></td>" +
      '<td><a href="mailto:' + esc(p.email) + '">' + esc(p.email) + "</a></td>" +
      '<td class="nowrap">' + (tel ? '<a href="tel:' + esc(tel) + '">' + esc(p.phone) + "</a>" : "") + "</td>" +
      '<td class="nowrap muted">' + esc(joined(p)) + "</td>" +
      '<td class="nowrap">' + esc(nw ? bookingOf(p.uid, nw.date) || "Not booked" : "") + "</td>" +
      '<td><button type="button" class="btn-danger-quiet" data-remove="' + esc(p.uid) + '">' + (p.uid === user.uid ? "You" : "Remove") + "</button></td></tr>";
  }).join("");
  $("none").classList.toggle("hidden", list.length > 0);
  $("rows").querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", async () => {
    const uid = b.dataset.remove;
    if (uid === user.uid) return;
    if (!arm("rm:" + uid, b, "Tap again to remove")) return;
    state.armed = null;
    try { await removePlayer(uid); toast("Player removed."); } catch (err) { fail(err); }
  }));
}

async function removePlayer(uid) {
  // Take them out of every bay first, then delete the profile.
  for (const [id, s] of Object.entries(state.slots)) {
    if (Array.isArray(s.uids) && s.uids.includes(uid)) {
      await editRoster(id, (u, n) => { delete n[uid]; return [u.filter((x) => x !== uid), n]; });
      if (s.date >= todayIso()) queueOpening(id);
    }
  }
  for (const w of state.waitlist.filter((x) => x.uid === uid)) await deleteDoc(doc(db, "waitlist", w.id)).catch(() => {});
  await deleteDoc(doc(db, "players", uid));
}

function downloadCsv() {
  const cell = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const nw = nextWeek();
  const rows = [["Name", "Email", "Phone", "Joined", "Next Monday"]].concat(
    state.players.map((p) => [p.name, p.email, p.phone, joined(p), nw ? bookingOf(p.uid, nw.date) : ""])
  );
  const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "monday-league-players.csv";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ── Weekly courses ──
const FIELDS = [
  ["course", "Course name", "text", "e.g. Mammoth Dunes"],
  ["image", "TrackMan image link", "url", "https://cdn.trackmangolf.com/course-resources/…"],
  ["location", "Location", "text", "e.g. Sand Valley · Wisconsin, US"],
  ["par", "Par", "text", "73"],
  ["yards", "Yards", "text", "6,389"],
  ["difficulty", "Difficulty", "text", "3 of 5"],
  ["note", "Signature hole or note", "text", "e.g. No. 8, a par 3 ringed by sand"]
];

function renderCourses() {
  const rows = state.weeks.map((w) => {
    const img = safeUrl(w.image);
    const thumb = img ? '<img class="week-thumb" src="' + esc(img) + '" alt="">' : '<div class="week-thumb none">No image</div>';
    const head = '<div class="week-date"><span class="small muted" style="font-weight:600">' + esc(fmtDate(w.date, { month: "short" })) + "</span><b>" + esc(fmtDate(w.date, { day: "numeric" })) + "</b></div>" + thumb;
    if (state.editing !== w.date) {
      return '<div class="week-row">' + head + '<div class="week-info"><b style="font-size:17px">' + esc(w.course || "Not set yet") + '</b><div class="small muted">' + (w.course ? "Shown to players" : "Players see “Course to be announced”") + "</div></div>" +
        '<button type="button" class="btn btn-outline btn-sm" data-edit="' + esc(w.date) + '">' + (w.course ? "Edit" : "Set course") + "</button>" +
        '<button type="button" class="btn-danger-quiet" data-delweek="' + esc(w.date) + '">Remove Monday</button></div>';
    }
    const d = state.draft;
    return '<div class="week-row">' + head + '<div class="week-info"><b>' + esc(fmtDate(w.date, { weekday: "long", month: "long", day: "numeric" })) + "</b></div>" +
      '<div class="week-edit">' + FIELDS.map(([k, label, type, ph]) => '<label class="field">' + esc(label) + '<input type="' + type + '" data-k="' + k + '" placeholder="' + esc(ph) + '" value="' + esc(d[k] || "") + '"></label>').join("") +
      '<label class="field" style="grid-column:1/-1">Short description<textarea data-k="blurb" placeholder="A sentence or two about the course">' + esc(d.blurb || "") + "</textarea></label></div>" +
      '<div class="week-actions"><button type="button" class="btn btn-primary btn-sm" id="save-week">Save</button><button type="button" class="btn btn-quiet btn-sm" id="cancel-week">Cancel</button></div></div>';
  }).join("");
  panel.innerHTML = '<section class="rise" style="display:flex;flex-direction:column;gap:12px">' +
    '<p class="muted" style="margin:0">Set the course for each Monday. Find the course on trackman.com/golf/simulator/courses, then paste its name and image link. Players see changes right away.</p>' +
    (rows || '<div class="panel" style="padding:20px">No Mondays yet. Add the first one below.</div>') +
    '<div class="panel" style="padding:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end"><label class="field" style="flex:0 1 220px">Add a Monday<input type="date" id="new-date"></label>' +
    '<label class="field" style="flex:0 1 140px">How many weeks<input type="number" id="new-count" min="1" max="20" value="1"></label>' +
    '<button type="button" class="btn btn-dark" id="add-week">Add</button></div></section>';

  panel.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => {
    const w = state.weeks.find((x) => x.date === b.dataset.edit);
    state.editing = w.date;
    state.draft = Object.fromEntries(FIELDS.map(([k]) => [k, w[k] == null ? "" : String(w[k])]).concat([["blurb", w.blurb || ""]]));
    render();
  }));
  panel.querySelectorAll("[data-k]").forEach((i) => i.addEventListener("input", () => { state.draft[i.dataset.k] = i.value; }));
  const save = $("save-week");
  if (save) save.addEventListener("click", async () => {
    const d = state.draft;
    if (d.image && !safeUrl(d.image)) { toast("The image link must start with https://", "error"); return; }
    const data = { date: state.editing };
    for (const k of FIELDS.map((f) => f[0]).concat(["blurb"])) data[k] = String(d[k] || "").trim().slice(0, k === "blurb" ? 600 : 200);
    save.disabled = true;
    try { await setDoc(doc(db, "weeks", state.editing), data); state.editing = null; toast("Course saved."); render(); }
    catch (err) { fail(err); save.disabled = false; }
  });
  const cancel = $("cancel-week");
  if (cancel) cancel.addEventListener("click", () => { state.editing = null; render(); });
  panel.querySelectorAll("[data-delweek]").forEach((b) => b.addEventListener("click", async () => {
    const date = b.dataset.delweek;
    const hasBookings = Object.entries(state.slots).some(([id, s]) => id.startsWith(date + "_") && s.uids && s.uids.length);
    if (!arm("dw:" + date, b, hasBookings ? "Has bookings! Tap again" : "Tap again to remove")) return;
    state.armed = null;
    try {
      for (const id of Object.keys(state.slots)) if (id.startsWith(date + "_")) await deleteDoc(doc(db, "slots", id));
      await deleteDoc(doc(db, "weeks", date));
      toast("Monday removed.");
    } catch (err) { fail(err); }
  }));
  $("add-week").addEventListener("click", async () => {
    const v = $("new-date").value;
    const count = Math.min(20, Math.max(1, parseInt($("new-count").value, 10) || 1));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { toast("Pick a date first.", "error"); return; }
    if (new Date(v + "T12:00:00").getDay() !== 1) { toast("That date isn't a Monday.", "error"); return; }
    try {
      const start = new Date(v + "T12:00:00");
      for (let i = 0; i < count; i++) {
        const d = new Date(start); d.setDate(start.getDate() + 7 * i);
        const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        if (!state.weeks.some((w) => w.date === iso)) await setDoc(doc(db, "weeks", iso), { date: iso, course: "" });
      }
      toast(count === 1 ? "Monday added." : count + " Mondays added.");
    } catch (err) { fail(err); }
  });
}

// ── Bookings ──
// Tells the reminder script a spot opened so it can email that bay's waitlist.
async function queueOpening(id) {
  const [date, slot, bay] = id.split("_");
  try {
    await setDoc(doc(db, "openings", id + "_" + Date.now() + "_admin"), { date, slot, bay: Number(bay), status: "new", createdAt: serverTimestamp() });
  } catch { /* the removal itself already succeeded */ }
}
function waitersFor(id) {
  const ms = (w) => (w.createdAt && typeof w.createdAt.toMillis === "function" ? w.createdAt.toMillis() : 0);
  return state.waitlist.filter((w) => w.date + "_" + w.slot + "_" + w.bay === id).sort((a, b) => ms(a) - ms(b));
}
async function editRoster(id, fn) {
  const ref = doc(db, "slots", id);
  const [date, slot, bay] = id.split("_");
  await runTransaction(db, async (tx) => {
    const sn = await tx.get(ref);
    const d = sn.exists() ? sn.data() : { date, slot, bay: Number(bay), uids: [], names: {} };
    const [uids, names] = fn([...(d.uids || [])], { ...(d.names || {}) });
    if (uids.length > MAX) throw Object.assign(new Error("full"), { code: "full" });
    tx.set(ref, { date: d.date, slot: d.slot, bay: Number(d.bay), uids, names });
  });
}

// Move a player to another bay/time that night. If swapUid is given, that player goes
// the other way (a straight swap, so both bays keep the same count).
async function moveOrSwap(fromId, uid, toId, swapUid) {
  const fromRef = doc(db, "slots", fromId), toRef = doc(db, "slots", toId);
  const base = (id) => { const [date, slot, bay] = id.split("_"); return { date, slot, bay: Number(bay), uids: [], names: {} }; };
  await runTransaction(db, async (tx) => {
    const [fs, ts] = await Promise.all([tx.get(fromRef), tx.get(toRef)]);
    const f = fs.exists() ? fs.data() : base(fromId), t = ts.exists() ? ts.data() : base(toId);
    let fu = [...(f.uids || [])], tu = [...(t.uids || [])];
    const fn = { ...(f.names || {}) }, tn = { ...(t.names || {}) };
    const nm = fn[uid] || nameOf(uid);
    if (!fu.includes(uid)) throw Object.assign(new Error("moved"), { code: "moved" });
    fu = fu.filter((x) => x !== uid); delete fn[uid];
    if (swapUid) {
      if (!tu.includes(swapUid)) throw Object.assign(new Error("moved"), { code: "moved" });
      const sn = tn[swapUid] || nameOf(swapUid);
      tu = tu.filter((x) => x !== swapUid); delete tn[swapUid];
      fu.push(swapUid); fn[swapUid] = sn;
    }
    if (!tu.includes(uid)) { tu.push(uid); tn[uid] = nm; }
    if (tu.length > MAX) throw Object.assign(new Error("full"), { code: "full" });
    tx.set(fromRef, { date: f.date, slot: f.slot, bay: Number(f.bay), uids: fu, names: fn });
    tx.set(toRef, { date: t.date, slot: t.slot, bay: Number(t.bay), uids: tu, names: tn });
  });
  deleteDoc(doc(db, "waitlist", toId + "_" + uid)).catch(() => {});
  if (swapUid) deleteDoc(doc(db, "waitlist", fromId + "_" + swapUid)).catch(() => {});
  else if (fromId.slice(0, 10) >= todayIso()) queueOpening(fromId);
}

const slotLabel = (id) => { const [, slot, bay] = id.split("_"); return "Bay " + bay + " · " + ((LEAGUE.slots.find((s) => s.id === slot) || {}).time || slot); };

function renderBookings() {
  if (!state.weeks.length) { panel.innerHTML = '<div class="panel" style="padding:20px">Add Mondays in Weekly courses first.</div>'; return; }
  if (!state.weeks.some((w) => w.date === state.bookWeek)) state.bookWeek = (nextWeek() || state.weeks[0]).date;
  const date = state.bookWeek;
  const w = state.weeks.find((x) => x.date === date);
  const bookedThatDay = new Set();
  for (const s of LEAGUE.slots) for (const b of LEAGUE.bays) roster(date, s.id, b).forEach((p) => bookedThatDay.add(p.uid));
  const whereIs = {};
  for (const s of LEAGUE.slots) for (const b of LEAGUE.bays) roster(date, s.id, b).forEach((p) => { whereIs[p.uid] = slotId(date, s.id, b); });
  const allIds = [];
  for (const s of LEAGUE.slots) for (const b of LEAGUE.bays) allIds.push(slotId(date, s.id, b));
  const everyone = [...state.players].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const cards = [];
  for (const s of LEAGUE.slots) for (const b of LEAGUE.bays) {
    const ps = roster(date, s.id, b);
    const id = slotId(date, s.id, b);
    const moveSel = (p) => {
      const opts = [];
      for (const other of allIds) {
        if (other === id) continue;
        const [, oSlot, oBay] = other.split("_");
        const there = roster(date, oSlot, Number(oBay));
        if (there.length < MAX) opts.push('<option value="' + esc(other) + '|">Move to ' + esc(slotLabel(other)) + "</option>");
        there.forEach((q) => opts.push('<option value="' + esc(other) + "|" + esc(q.uid) + '">Swap with ' + esc(q.name) + " (" + esc(slotLabel(other)) + ")</option>"));
      }
      return '<select class="mv" aria-label="Move or swap ' + esc(p.name) + '" data-slot="' + esc(id) + '" data-uid="' + esc(p.uid) + '"><option value="">Move / swap…</option>' + opts.join("") + "</select>";
    };
    const addable = everyone.filter((p) => whereIs[p.uid] !== id);
    cards.push('<div class="roster"><div class="roster-top"><b>Bay ' + b + " · " + esc(s.time) + '</b><span class="nowrap">' + ps.length + " of " + MAX + "</span></div><ul>" +
      (ps.map((p) => '<li><span class="rn">' + esc(p.name) + '</span><span class="ra">' + moveSel(p) + '<button type="button" class="x" aria-label="Remove ' + esc(p.name) + '" data-slot="' + esc(id) + '" data-uid="' + esc(p.uid) + '">×</button></span></li>').join("") || '<li class="muted" style="font-weight:400">Nobody yet</li>') +
      "</ul>" + (waitersFor(id).length ? '<p class="waitline" style="margin:0 16px 12px">Waitlist: ' + waitersFor(id).map((w) => esc(w.name)).join(", ") + "</p>" : "") +
      (ps.length < MAX && addable.length ? '<div class="roster-add"><select aria-label="Player to add" data-for="' + esc(id) + '"><option value="">Add a player…</option>' +
        addable.map((p) => '<option value="' + esc(p.uid) + '">' + esc(p.name) + (whereIs[p.uid] ? " (moves from " + esc(slotLabel(whereIs[p.uid])) + ")" : "") + "</option>").join("") +
        '</select><button type="button" class="btn btn-dark btn-sm" data-add="' + esc(id) + '">Add</button></div>' : "") +
      (ps.length >= MAX ? '<p class="small muted" style="margin:0 16px 14px">Full. Use Move / swap on a player to trade spots.</p>' : "") + "</div>");
  }
  panel.innerHTML = '<section class="rise" style="display:flex;flex-direction:column;gap:14px">' +
    '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end"><label class="field" style="flex:0 1 320px">Monday<select id="bw">' +
    state.weeks.map((x) => '<option value="' + esc(x.date) + '"' + (x.date === date ? " selected" : "") + ">" + esc(fmtDate(x.date, { weekday: "short", month: "short", day: "numeric" }) + (x.course ? " · " + x.course : "")) + "</option>").join("") +
    '</select></label><p class="muted" style="margin:0 0 12px">' + esc(w && w.course ? w.course : "Course to be announced") + ". Remove someone who can't make it, or add a player who called you.</p></div>" +
    '<div class="rosters">' + cards.join("") + "</div></section>";
  $("bw").addEventListener("change", (e) => { state.bookWeek = e.target.value; render(); });
  panel.querySelectorAll(".x").forEach((b) => b.addEventListener("click", async () => {
    const uid = b.dataset.uid;
    try {
      await editRoster(b.dataset.slot, (u, n) => { delete n[uid]; return [u.filter((x) => x !== uid), n]; });
      if (b.dataset.slot.slice(0, 10) >= todayIso()) queueOpening(b.dataset.slot);
      toast(waitersFor(b.dataset.slot).length ? "Removed. The waitlist will be emailed." : "Removed.");
    } catch (err) { fail(err); }
  }));
  panel.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", async () => {
    const id = b.dataset.add;
    const sel = panel.querySelector('select[data-for="' + id + '"]');
    const uid = sel && sel.value;
    if (!uid) { toast("Pick a player first.", "error"); return; }
    try {
      if (whereIs[uid]) {
        await moveOrSwap(whereIs[uid], uid, id, null);
        toast(nameOf(uid) + " moved to " + slotLabel(id) + ".");
      } else {
        await editRoster(id, (u, n) => { if (!u.includes(uid)) u.push(uid); n[uid] = nameOf(uid); return [u, n]; });
        deleteDoc(doc(db, "waitlist", id + "_" + uid)).catch(() => {});
        toast(nameOf(uid) + " added.");
      }
    } catch (err) { toast(err.code === "full" ? "That bay is full." : friendlyError(err), "error"); }
  }));
  panel.querySelectorAll("select.mv").forEach((sel) => sel.addEventListener("change", async () => {
    if (!sel.value) return;
    const [toId, swapUid] = sel.value.split("|");
    const uid = sel.dataset.uid, fromId = sel.dataset.slot;
    sel.disabled = true;
    try {
      await moveOrSwap(fromId, uid, toId, swapUid || null);
      toast(swapUid ? nameOf(uid) + " and " + nameOf(swapUid) + " swapped." : nameOf(uid) + " moved to " + slotLabel(toId) + ".");
    } catch (err) {
      toast(err.code === "full" ? "That bay just filled up." : err.code === "moved" ? "The bookings changed. Try again." : friendlyError(err), "error");
      sel.disabled = false; sel.value = "";
    }
  }));
}

// ── Messages ──
function renderMessages() {
  const a = state.announcement || {};
  if (state.annDraft === null) state.annDraft = String(a.text || "");
  const live = a.text && a.show !== false;
  const fmt = (t) => (t && typeof t.toDate === "function" ? t.toDate().toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "just now");
  const label = { queued: "Waiting to send (within 5 min)", sending: "Sending…", sent: "Sent", partial: "Paused at the daily email limit; resumes tomorrow", error: "Error" };
  const recent = state.broadcasts.slice(0, 8).map((b) => '<div class="bc-row"><div><b>' + esc(b.subject || "(no subject)") + '</b><span class="muted">' + esc(fmt(b.createdAt)) + "</span></div>" +
    '<span class="nowrap" style="font-weight:600">' + esc(label[b.status] || b.status || "") + (b.total ? " · " + esc((b.sentCount || 0) + " of " + b.total) : "") + "</span></div>").join("");
  const d = state.mailDraft;
  panel.innerHTML = '<section class="settings rise">' +
    '<div class="panel announce-admin"><h2>Announcement banner</h2><p class="muted" style="margin:0">Shows at the top of the booking page for everyone. ' + (live ? "<b>Live now.</b>" : "Nothing is showing right now.") + "</p>" +
      '<label class="field">Message<textarea id="ann-text" maxlength="600" placeholder="e.g. No league on Dec 28. Merry Christmas!">' + esc(state.annDraft) + "</textarea></label>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-primary" id="ann-save">' + (live ? "Update banner" : "Post banner") + "</button>" +
      (live ? '<button type="button" class="btn btn-quiet" id="ann-clear">Take it down</button>' : "") + "</div></div>" +
    '<div class="panel announce-admin"><h2>Email all players</h2><p class="muted" style="margin:0">Goes to all ' + state.players.length + " players, one email each, from your Google account. Sends within about 5 minutes.</p>" +
      '<label class="field">Subject<input type="text" id="mail-subject" maxlength="120" placeholder="e.g. Course change for Monday" value="' + esc(d.subject) + '"></label>' +
      '<label class="field">Message<textarea id="mail-body" maxlength="4000" style="min-height:140px" placeholder="Write your message…">' + esc(d.body) + "</textarea></label>" +
      '<button type="button" class="btn btn-dark" style="align-self:flex-start" id="mail-send">Send to everyone</button>' +
      (recent ? '<h3 style="font-size:20px;margin-top:6px">Recent emails</h3>' + recent : "") + "</div></section>";
  $("ann-text").addEventListener("input", (e) => { state.annDraft = e.target.value; });
  $("ann-save").addEventListener("click", async () => {
    const text = state.annDraft.trim();
    if (!text) { toast("Write a message first.", "error"); return; }
    try { await setDoc(doc(db, "config", "announcement"), { text: text.slice(0, 600), show: true, updatedAt: serverTimestamp(), by: user.uid }); toast("Banner is live."); } catch (err) { fail(err); }
  });
  const clr = $("ann-clear");
  if (clr) clr.addEventListener("click", async () => {
    try { await setDoc(doc(db, "config", "announcement"), { text: "", show: false, updatedAt: serverTimestamp(), by: user.uid }); state.annDraft = ""; toast("Banner taken down."); } catch (err) { fail(err); }
  });
  $("mail-subject").addEventListener("input", (e) => { d.subject = e.target.value; });
  $("mail-body").addEventListener("input", (e) => { d.body = e.target.value; });
  $("mail-send").addEventListener("click", async (e) => {
    const subject = d.subject.trim(), body = d.body.trim();
    if (!subject || !body) { toast("Add a subject and a message.", "error"); return; }
    if (!arm("mail", e.currentTarget, "Tap again to email " + state.players.length + " players")) return;
    state.armed = null;
    try {
      await setDoc(doc(db, "broadcasts", "b" + Date.now()), { subject: subject.slice(0, 120), body: body.slice(0, 4000), status: "queued", by: user.uid, createdAt: serverTimestamp() });
      state.mailDraft = { subject: "", body: "" };
      toast("Queued. It goes out within about 5 minutes.");
      render();
    } catch (err) { fail(err); }
  });
}

// ── Settings ──
function renderSettings() {
  const orgs = state.admins.map((a) => '<div class="org-row"><span>' + esc(nameOf(a.uid) !== "Player" ? nameOf(a.uid) : (a.name || a.uid)) + "</span>" +
    (a.uid === user.uid ? '<span class="small muted">You</span>' : '<button type="button" class="btn-danger-quiet" data-unorg="' + esc(a.uid) + '">Remove</button>') + "</div>").join("");
  const candidates = state.players.filter((p) => !state.admins.some((a) => a.uid === p.uid));
  panel.innerHTML = '<section class="settings rise">' +
    '<div class="panel"><h2>League password</h2><p class="muted" style="margin:0">New players need this to create an account. Changing it doesn\'t affect anyone who already joined.</p>' +
    '<p style="margin:0">Current: <b id="cur-code">••••••</b> <button type="button" class="link-btn" id="show-code">Show</button></p>' +
    '<label class="field">New league password<input type="text" id="new-code" autocomplete="off" placeholder="e.g. bunker-east-2026" maxlength="60"></label>' +
    '<button type="button" class="btn btn-primary" style="align-self:flex-start" id="save-code">Update password</button></div>' +
    '<div class="panel"><h2>Organizers</h2><p class="muted" style="margin:0">Organizers can open this page, see contact details and edit any booking.</p>' + orgs +
    (candidates.length ? '<div style="display:flex;gap:8px;flex-wrap:wrap"><label class="field" style="flex:1 1 200px">Make a player an organizer<select id="new-org"><option value="">Choose a player…</option>' + candidates.map((p) => '<option value="' + esc(p.uid) + '">' + esc(p.name) + "</option>").join("") + '</select></label><button type="button" class="btn btn-outline" style="align-self:flex-end" id="add-org">Add</button></div>' : "") +
    "</div></section>";
  $("show-code").addEventListener("click", async () => {
    try { const s = await getDoc(doc(db, "secrets", "league")); $("cur-code").textContent = s.exists() ? s.data().code : "Not set"; } catch (err) { fail(err); }
  });
  $("save-code").addEventListener("click", async () => {
    const code = $("new-code").value.trim();
    if (code.length < 4) { toast("Use at least 4 characters.", "error"); return; }
    try { await setDoc(doc(db, "secrets", "league"), { code }); $("new-code").value = ""; $("cur-code").textContent = code; toast("League password updated."); } catch (err) { fail(err); }
  });
  const add = $("add-org");
  if (add) add.addEventListener("click", async () => {
    const uid = $("new-org").value;
    if (!uid) { toast("Choose a player first.", "error"); return; }
    try { await setDoc(doc(db, "admins", uid), { name: nameOf(uid), addedAt: serverTimestamp() }); toast(nameOf(uid) + " is now an organizer."); } catch (err) { fail(err); }
  });
  panel.querySelectorAll("[data-unorg]").forEach((b) => b.addEventListener("click", async () => {
    if (!arm("uo:" + b.dataset.unorg, b, "Tap again")) return;
    state.armed = null;
    try { await deleteDoc(doc(db, "admins", b.dataset.unorg)); toast("Organizer removed."); } catch (err) { fail(err); }
  }));
}
