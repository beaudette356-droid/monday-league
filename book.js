import {
  collection, query, orderBy, onSnapshot, doc, runTransaction, setDoc, deleteDoc, serverTimestamp
} from "./firebase.js";
import {
  db, LEAGUE, esc, safeUrl, fmtDate, todayIso, initials, slotId,
  toast, friendlyError, requireMember, wireSignOut
} from "./common.js";

const $ = (id) => document.getElementById(id);
const CHIPS = ["#bfe0c9", "#f3e1b3", "#cfe3f0", "#f6cfc4"];
const SLOT_STYLE = { early: ["#fbf1d9", "#a87a1c"], late: ["#e4ecf4", "#2c5a86"] };
const MAX = LEAGUE.maxPerBay;

const state = {
  me: null, weeks: [], slots: {}, waitlist: [], announcement: null,
  sel: null, fresh: null, busy: false, loadedWeeks: false
};

wireSignOut();
setupInstall();
$("season-badge").textContent = LEAGUE.season + " · Every Monday night";

const { user, profile, isAdmin } = await requireMember();
state.me = { uid: user.uid, name: profile.name };
$("me-name").textContent = profile.name;
$("me-ini").textContent = initials(profile.name);
if (isAdmin) $("admin-link").classList.remove("hidden");

// Live data: Mondays, bay rosters, waitlists and the organizer's announcement.
onSnapshot(query(collection(db, "weeks"), orderBy("date")), (snap) => {
  state.weeks = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.date || ""));
  state.loadedWeeks = true;
  if (!state.weeks.some((w) => w.date === state.sel)) state.sel = pickDefault();
  render();
}, (err) => { $("days").innerHTML = '<div class="loading">' + esc(friendlyError(err)) + "</div>"; });

onSnapshot(collection(db, "slots"), (snap) => {
  const next = {};
  snap.forEach((d) => { next[d.id] = d.data(); });
  state.slots = next;
  render();
}, (err) => toast(friendlyError(err), "error"));

onSnapshot(collection(db, "waitlist"), (snap) => {
  state.waitlist = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  render();
}, () => { /* waitlist is optional; booking still works without it */ });

onSnapshot(doc(db, "config", "announcement"), (snap) => {
  state.announcement = snap.exists() ? snap.data() : null;
  renderAnnouncement();
}, () => { /* no announcement */ });

function pickDefault() {
  const t = todayIso();
  const up = state.weeks.find((w) => w.date >= t);
  return up ? up.date : (state.weeks.length ? state.weeks[state.weeks.length - 1].date : null);
}

function roster(date, slot, bay) {
  const s = state.slots[slotId(date, slot, bay)];
  if (!s || !Array.isArray(s.uids)) return [];
  return s.uids.map((uid) => ({ uid, name: (s.names && s.names[uid]) || "Player" }));
}

function waiting(date, slot, bay) {
  const ms = (w) => (w.createdAt && typeof w.createdAt.toMillis === "function" ? w.createdAt.toMillis() : Number.MAX_SAFE_INTEGER);
  return state.waitlist
    .filter((w) => w.date === date && w.slot === slot && Number(w.bay) === Number(bay))
    .sort((a, b) => ms(a) - ms(b));
}

function isClosed(date, slot, bay) {
  const w = state.weeks.find((x) => x.date === date);
  return !!(w && Array.isArray(w.closed) && w.closed.includes(slot + "_" + bay));
}

function myBooking(date) {
  for (const s of LEAGUE.slots) for (const b of LEAGUE.bays) {
    if (roster(date, s.id, b).some((p) => p.uid === state.me.uid)) return { slot: s, bay: b };
  }
  return null;
}

function render() {
  if (!state.loadedWeeks) return;
  renderDays();
  renderCourse();
  renderSlots();
}

function renderAnnouncement() {
  const el = $("announce");
  const a = state.announcement;
  const text = a && a.show !== false ? String(a.text || "").trim() : "";
  if (!text) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  const when = a.updatedAt && typeof a.updatedAt.toDate === "function"
    ? a.updatedAt.toDate().toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" }) : "";
  el.innerHTML = '<span class="announce-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/></svg></span>' +
    '<div><b>From the organizer</b>' + (when ? ' <span class="announce-when">· ' + esc(when) + "</span>" : "") +
    '<p>' + esc(text) + "</p></div>";
  el.classList.remove("hidden");
}

function renderDays() {
  const el = $("days");
  if (!state.weeks.length) {
    el.innerHTML = '<div class="loading">No Mondays are on the schedule yet. Check back soon.</div>';
    $("my-status").textContent = "";
    return;
  }
  const t = todayIso();
  el.innerHTML = state.weeks.map((w) => {
    let open = 0;
    for (const s of LEAGUE.slots) for (const b of LEAGUE.bays) if (!isClosed(w.date, s.id, b)) open += Math.max(0, MAX - roster(w.date, s.id, b).length);
    const mine = !!myBooking(w.date);
    const sel = w.date === state.sel;
    return '<button type="button" class="day' + (w.date < t ? " past" : "") + '" data-date="' + esc(w.date) + '" aria-pressed="' + sel + '">' +
      '<span class="m">' + esc(fmtDate(w.date, { month: "short" })) + "</span>" +
      '<span class="d">' + esc(fmtDate(w.date, { day: "numeric" })) + "</span>" +
      '<span class="tag' + (mine ? " booked" : "") + '">' + (mine ? "Booked" : open + " open") + "</span>" +
      '<span class="c">' + esc(w.course || "Course TBA") + "</span></button>";
  }).join("");
  el.querySelectorAll(".day").forEach((b) => b.addEventListener("click", () => {
    state.sel = b.dataset.date; state.fresh = null; render();
  }));
  const mb = state.sel && myBooking(state.sel);
  const myWaits = state.sel ? state.waitlist.filter((w) => w.date === state.sel && w.uid === state.me.uid) : [];
  let status = mb ? "You're in Bay " + mb.bay + ", " + mb.slot.time + "." : "You're not booked for this Monday yet.";
  if (myWaits.length) status += " On the waitlist for " + myWaits.map((w) => "Bay " + w.bay + ", " + ((LEAGUE.slots.find((s) => s.id === w.slot) || {}).time || "")).join(" and ") + ".";
  $("my-status").textContent = status;
}

const PLACEHOLDER = '<svg viewBox="0 0 600 360" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><path d="M0 220 Q120 150 240 200 T480 170 T600 190 L600 360 L0 360 Z" fill="#e6cf95"/><path d="M0 260 Q160 210 320 250 T600 236 L600 360 L0 360 Z" fill="#7cb66f"/><path d="M0 300 Q200 268 380 296 T600 288 L600 360 L0 360 Z" fill="#5c9e58"/><ellipse cx="410" cy="270" rx="70" ry="14" fill="#9bd28c"/><line x1="420" y1="270" x2="420" y2="212" stroke="#fff" stroke-width="3"/><path d="M421 212 L448 220 L421 228 Z" fill="#c8341c"/></svg>';

function renderCourse() {
  const el = $("course");
  const w = state.weeks.find((x) => x.date === state.sel);
  if (!w) { el.innerHTML = ""; return; }
  const when = "Course for " + fmtDate(w.date, { weekday: "long", month: "long", day: "numeric" });
  const img = safeUrl(w.image);
  const pic = img ? '<img src="' + esc(img) + '" alt="' + esc((w.course || "Course") + " in TrackMan") + '" loading="lazy">' : PLACEHOLDER;
  let body;
  if (w.course) {
    const stats = [["Par", w.par], ["Yards", w.yards], ["Difficulty", w.difficulty]].filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
    body = '<span class="course-when">' + esc(when) + "</span>" +
      "<h2>" + esc(w.course) + "</h2>" +
      (w.location ? '<span class="muted">' + esc(w.location) + "</span>" : "") +
      (stats.length ? '<div class="stats">' + stats.map(([k, v]) => '<div class="stat"><span>' + esc(k) + "</span><b>" + esc(v) + "</b></div>").join("") + "</div>" : "") +
      (w.blurb ? '<p style="margin:0">' + esc(w.blurb) + "</p>" : "") +
      (w.note ? '<div class="callout"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a87a1c" stroke-width="2" stroke-linecap="round" aria-hidden="true" style="flex:none;margin-top:2px"><path d="M6 21V4M6 4l11 4-11 4"/></svg><span>' + esc(w.note) + "</span></div>" : "") +
      (img ? '<span class="small muted">Course image from the TrackMan course library.</span>' : "");
  } else {
    body = '<span class="course-when">' + esc(when) + '</span><h2>Course to be announced</h2><p class="muted" style="margin:0">The organizer hasn\'t picked this week\'s course yet. Book your bay now and check back.</p>';
  }
  el.innerHTML = '<section class="course" aria-label="Course of the week"><div class="course-img">' + pic + '<span class="course-tag">Course of the week</span></div><div class="course-body">' + body + "</div></section>";
}

function renderSlots() {
  const el = $("slots");
  if (!state.sel) { el.innerHTML = ""; return; }
  const date = state.sel;
  const mine = myBooking(date);
  const past = date < todayIso();
  let n = 0;
  el.innerHTML = LEAGUE.slots.map((s) => {
    const [bg, fg] = SLOT_STYLE[s.id] || ["#eef6f0", "#2f7d4f"];
    const cards = LEAGUE.bays.map((b) => {
      const ps = roster(date, s.id, b);
      const isMine = ps.some((p) => p.uid === state.me.uid);
      const closed = isClosed(date, s.id, b);
      const full = !isMine && ps.length >= MAX;
      const id = slotId(date, s.id, b);
      const wl = waiting(date, s.id, b);
      const myPos = wl.findIndex((w) => w.uid === state.me.uid) + 1;
      const bars = Array.from({ length: MAX }, (_, i) => '<i class="' + (ps[i] ? (ps[i].uid === state.me.uid ? "me" : "on") : "") + '"></i>').join("");
      const seats = Array.from({ length: MAX }, (_, i) => {
        const p = ps[i];
        if (!p) return closed
          ? '<li class="seat"><span class="open" aria-hidden="true">–</span><span class="empty">Not available</span></li>'
          : '<li class="seat"><span class="open" aria-hidden="true">+</span><span class="empty">Open spot</span></li>';
        const me = p.uid === state.me.uid;
        const cls = me ? (state.fresh === id ? "av pop mine" : "av mine") : "av";
        return '<li class="seat"><span class="' + cls + '" style="background:' + (me ? "#ffd24a" : CHIPS[i % 4]) + '">' + esc(initials(p.name)) + '</span><span class="name">' + esc(p.name) + "</span>" + (me ? '<span class="you">You</span>' : "") + "</li>";
      }).join("");
      const waitLine = closed ? '<p class="closed-msg">This bay has been released back to The Bunker for the night.</p>' : wl.length
        ? '<p class="waitline"><span class="waitdot" aria-hidden="true"></span>' + wl.length + " on the waitlist" + (myPos ? " · you're #" + myPos : "") + "</p>"
        : "";
      const attrs = ' data-slot="' + s.id + '" data-bay="' + b + '"';
      let btn;
      if (past) btn = '<button type="button" class="btn btn-quiet btn-block" disabled>This Monday has passed</button>';
      else if (closed && !isMine) btn = '<button type="button" class="btn btn-quiet btn-block" disabled>Closed</button>';
      else if (isMine) btn = '<button type="button" class="btn btn-outline btn-block" data-act="leave"' + attrs + '>Leave this bay</button>';
      else if (full && myPos) btn = '<button type="button" class="btn btn-outline btn-block" data-act="unwait"' + attrs + '>Leave the waitlist</button>';
      else if (full) btn = '<button type="button" class="btn btn-dark btn-block" data-act="wait"' + attrs + '>Full · Join the waitlist</button>';
      else btn = '<button type="button" class="btn btn-primary btn-block" data-act="join"' + attrs + '>' + (mine ? "Move me to Bay " + b : "Book Bay " + b) + "</button>";
      return '<article class="bay' + (isMine ? " is-mine" : "") + (closed ? " is-closed" : "") + '" style="animation-delay:' + (0.08 * n++) + 's">' +
        '<div class="bay-top"><span class="bay-num" aria-hidden="true">' + b + '</span><div class="bay-title"><b>Bay ' + b + "</b><span>" + (closed ? "Closed" : ps.length + " of " + MAX + " booked") + '</span></div><div class="bars" aria-hidden="true">' + bars + "</div></div>" +
        '<ul class="seats">' + seats + "</ul>" + waitLine + '<div class="bay-foot">' + btn + "</div></article>";
    }).join("");
    return '<section><div class="slot-head"><span class="slot-icon" style="background:' + bg + ";color:" + fg + '">' + esc(s.short) + '</span><div><h2>' + esc(s.name) + '</h2><span class="when">' + esc(s.time) + " · " + esc(fmtDate(date, { weekday: "long", month: "long", day: "numeric" })) + '</span></div></div><div class="bays">' + cards + "</div></section>";
  }).join("") +
  '<p class="small muted" style="margin:0">Waitlist: if a spot opens in a full bay, everyone on its waitlist gets an email. The first to tap <b>Take the spot</b> gets it.</p>';
  el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
    const slot = b.dataset.slot, bay = Number(b.dataset.bay);
    ({ join, leave, wait: joinWaitlist, unwait: leaveWaitlist })[b.dataset.act](date, slot, bay, b);
  }));
}

// Tell the reminder script a spot opened, so it can email the waitlist.
async function queueOpening(date, slot, bay) {
  try {
    const id = slotId(date, slot, bay) + "_" + Date.now() + "_" + state.me.uid.slice(0, 6);
    await setDoc(doc(db, "openings", id), { date, slot, bay, status: "new", createdAt: serverTimestamp() });
  } catch { /* the booking change itself already succeeded */ }
}

async function join(date, slot, bay, btn) {
  if (state.busy) return;
  state.busy = true; btn.disabled = true; btn.textContent = "Booking…";
  const me = state.me;
  const targetId = slotId(date, slot, bay);
  const ids = [];
  for (const s of LEAGUE.slots) for (const b of LEAGUE.bays) ids.push(slotId(date, s.id, b));
  let left = [];
  try {
    await runTransaction(db, async (tx) => {
      left = [];
      const refs = ids.map((id) => doc(db, "slots", id));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      let target = null;
      snaps.forEach((sn, i) => {
        if (ids[i] === targetId) { target = sn; return; }
        const d = sn.exists() ? sn.data() : null;
        if (d && Array.isArray(d.uids) && d.uids.includes(me.uid)) {
          const names = { ...(d.names || {}) }; delete names[me.uid];
          tx.update(refs[i], { uids: d.uids.filter((u) => u !== me.uid), names });
          left.push(d);
        }
      });
      const tref = doc(db, "slots", targetId);
      if (!target.exists()) {
        tx.set(tref, { date, slot, bay, uids: [me.uid], names: { [me.uid]: me.name } });
      } else {
        const d = target.data();
        const uids = Array.isArray(d.uids) ? d.uids : [];
        if (uids.includes(me.uid)) return;
        if (uids.length >= MAX) throw Object.assign(new Error("full"), { code: "full" });
        tx.update(tref, { uids: [...uids, me.uid], names: { ...(d.names || {}), [me.uid]: me.name } });
      }
    });
    state.fresh = targetId;
    toast("You're booked in Bay " + bay + ". See you Monday!");
    for (const d of left) queueOpening(d.date, d.slot, d.bay);
    if (waiting(date, slot, bay).some((w) => w.uid === me.uid)) {
      deleteDoc(doc(db, "waitlist", targetId + "_" + me.uid)).catch(() => {});
    }
  } catch (err) {
    toast(err.code === "full" ? "Someone just grabbed the last spot. You can join the waitlist." : friendlyError(err), "error");
  }
  state.busy = false;
  render();
}

async function leave(date, slot, bay, btn) {
  if (state.busy) return;
  state.busy = true; btn.disabled = true; btn.textContent = "Leaving…";
  const ref = doc(db, "slots", slotId(date, slot, bay));
  let didLeave = false;
  try {
    await runTransaction(db, async (tx) => {
      didLeave = false;
      const sn = await tx.get(ref);
      if (!sn.exists()) return;
      const d = sn.data();
      if (!Array.isArray(d.uids) || !d.uids.includes(state.me.uid)) return;
      const names = { ...(d.names || {}) }; delete names[state.me.uid];
      tx.update(ref, { uids: d.uids.filter((u) => u !== state.me.uid), names });
      didLeave = true;
    });
    toast("You've left Bay " + bay + ".");
    if (didLeave) queueOpening(date, slot, bay);
  } catch (err) {
    toast(friendlyError(err), "error");
  }
  state.busy = false;
  render();
}

async function joinWaitlist(date, slot, bay, btn) {
  if (state.busy) return;
  state.busy = true; btn.disabled = true; btn.textContent = "Joining…";
  try {
    await setDoc(doc(db, "waitlist", slotId(date, slot, bay) + "_" + state.me.uid), {
      date, slot, bay, uid: state.me.uid, name: state.me.name, createdAt: serverTimestamp()
    });
    toast("You're on the waitlist for Bay " + bay + ". We'll email you if a spot opens.");
  } catch (err) {
    toast(friendlyError(err), "error");
  }
  state.busy = false;
  render();
}

async function leaveWaitlist(date, slot, bay, btn) {
  if (state.busy) return;
  state.busy = true; btn.disabled = true; btn.textContent = "Leaving…";
  try {
    await deleteDoc(doc(db, "waitlist", slotId(date, slot, bay) + "_" + state.me.uid));
    toast("You're off the waitlist for Bay " + bay + ".");
  } catch (err) {
    toast(friendlyError(err), "error");
  }
  state.busy = false;
  render();
}

// ── Add to your phone ──
function setupInstall() {
  const btn = $("install-btn");
  const dlg = $("install-dialog");
  if (!btn || !dlg) return;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (standalone) { btn.classList.add("hidden"); return; }
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; });
  btn.addEventListener("click", async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch { /* ignore */ }
      deferred = null;
      return;
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    $("install-ios").classList.toggle("hidden", !ios);
    $("install-other").classList.toggle("hidden", ios);
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  });
  dlg.querySelector("[data-close]").addEventListener("click", () => dlg.close ? dlg.close() : dlg.removeAttribute("open"));
}
