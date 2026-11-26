import {
  collection, query, orderBy, onSnapshot, doc, runTransaction
} from "./firebase.js";
import {
  db, LEAGUE, esc, safeUrl, fmtDate, todayIso, initials, slotId,
  toast, friendlyError, requireMember, wireSignOut
} from "./common.js";

const $ = (id) => document.getElementById(id);
const CHIPS = ["#bfe0c9", "#f3e1b3", "#cfe3f0", "#f6cfc4"];
const SLOT_STYLE = { early: ["#fbf1d9", "#a87a1c"], late: ["#e4ecf4", "#2c5a86"] };
const MAX = LEAGUE.maxPerBay;

const state = { me: null, weeks: [], slots: {}, sel: null, fresh: null, busy: false, loadedWeeks: false };

wireSignOut();
$("season-badge").textContent = LEAGUE.season + " · Every Monday night";

const { user, profile, isAdmin } = await requireMember();
state.me = { uid: user.uid, name: profile.name };
$("me-name").textContent = profile.name;
$("me-ini").textContent = initials(profile.name);
if (isAdmin) $("admin-link").classList.remove("hidden");

// Live data: the season's Mondays and every bay roster. Small league, so one listener each.
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
    for (const s of LEAGUE.slots) for (const b of LEAGUE.bays) open += Math.max(0, MAX - roster(w.date, s.id, b).length);
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
  $("my-status").textContent = mb ? "You're in Bay " + mb.bay + ", " + mb.slot.time + "." : "You're not booked for this Monday yet.";
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
      const full = !isMine && ps.length >= MAX;
      const id = slotId(date, s.id, b);
      const bars = Array.from({ length: MAX }, (_, i) => '<i class="' + (ps[i] ? (ps[i].uid === state.me.uid ? "me" : "on") : "") + '"></i>').join("");
      const seats = Array.from({ length: MAX }, (_, i) => {
        const p = ps[i];
        if (!p) return '<li class="seat"><span class="open" aria-hidden="true">+</span><span class="empty">Open spot</span></li>';
        const me = p.uid === state.me.uid;
        const cls = me ? (state.fresh === id ? "av pop mine" : "av mine") : "av";
        return '<li class="seat"><span class="' + cls + '" style="background:' + (me ? "#ffd24a" : CHIPS[i % 4]) + '">' + esc(initials(p.name)) + '</span><span class="name">' + esc(p.name) + "</span>" + (me ? '<span class="you">You</span>' : "") + "</li>";
      }).join("");
      let btn;
      if (past) btn = '<button type="button" class="btn btn-quiet btn-block" disabled>This Monday has passed</button>';
      else if (isMine) btn = '<button type="button" class="btn btn-outline btn-block" data-act="leave" data-slot="' + s.id + '" data-bay="' + b + '">Leave this bay</button>';
      else if (full) btn = '<button type="button" class="btn btn-quiet btn-block" disabled>Full · ' + MAX + " of " + MAX + "</button>";
      else btn = '<button type="button" class="btn btn-primary btn-block" data-act="join" data-slot="' + s.id + '" data-bay="' + b + '">' + (mine ? "Move me to Bay " + b : "Book Bay " + b) + "</button>";
      return '<article class="bay' + (isMine ? " is-mine" : "") + '" style="animation-delay:' + (0.08 * n++) + 's">' +
        '<div class="bay-top"><span class="bay-num" aria-hidden="true">' + b + '</span><div class="bay-title"><b>Bay ' + b + "</b><span>" + ps.length + " of " + MAX + ' booked</span></div><div class="bars" aria-hidden="true">' + bars + "</div></div>" +
        '<ul class="seats">' + seats + '</ul><div class="bay-foot">' + btn + "</div></article>";
    }).join("");
    return '<section><div class="slot-head"><span class="slot-icon" style="background:' + bg + ";color:" + fg + '">' + esc(s.short) + '</span><div><h2>' + esc(s.name) + '</h2><span class="when">' + esc(s.time) + " · " + esc(fmtDate(date, { weekday: "long", month: "long", day: "numeric" })) + '</span></div></div><div class="bays">' + cards + "</div></section>";
  }).join("");
  el.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
    const bay = Number(b.dataset.bay);
    if (b.dataset.act === "join") join(date, b.dataset.slot, bay, b); else leave(date, b.dataset.slot, bay, b);
  }));
}

async function join(date, slot, bay, btn) {
  if (state.busy) return;
  state.busy = true; btn.disabled = true; btn.textContent = "Booking…";
  const me = state.me;
  const targetId = slotId(date, slot, bay);
  const ids = [];
  for (const s of LEAGUE.slots) for (const b of LEAGUE.bays) ids.push(slotId(date, s.id, b));
  try {
    await runTransaction(db, async (tx) => {
      const refs = ids.map((id) => doc(db, "slots", id));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      let target = null;
      snaps.forEach((sn, i) => {
        if (ids[i] === targetId) { target = sn; return; }
        const d = sn.exists() ? sn.data() : null;
        if (d && Array.isArray(d.uids) && d.uids.includes(me.uid)) {
          const names = { ...(d.names || {}) }; delete names[me.uid];
          tx.update(refs[i], { uids: d.uids.filter((u) => u !== me.uid), names });
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
  } catch (err) {
    toast(err.code === "full" ? "Someone just grabbed the last spot. Pick another bay." : friendlyError(err), "error");
  }
  state.busy = false;
  render();
}

async function leave(date, slot, bay, btn) {
  if (state.busy) return;
  state.busy = true; btn.disabled = true; btn.textContent = "Leaving…";
  const ref = doc(db, "slots", slotId(date, slot, bay));
  try {
    await runTransaction(db, async (tx) => {
      const sn = await tx.get(ref);
      if (!sn.exists()) return;
      const d = sn.data();
      if (!Array.isArray(d.uids) || !d.uids.includes(state.me.uid)) return;
      const names = { ...(d.names || {}) }; delete names[state.me.uid];
      tx.update(ref, { uids: d.uids.filter((u) => u !== state.me.uid), names });
    });
    toast("You've left Bay " + bay + ".");
  } catch (err) {
    toast(friendlyError(err), "error");
  }
  state.busy = false;
  render();
}
