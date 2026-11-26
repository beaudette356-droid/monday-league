import {
  initializeApp, getAuth, onAuthStateChanged, signOut, getFirestore, doc, getDoc
} from "./firebase.js";
import { firebaseConfig, LEAGUE } from "./config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { LEAGUE };

export const configMissing = String(firebaseConfig.apiKey || "").startsWith("PASTE");

// Escape any text that came from the database before it goes into HTML.
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Only allow https links (course images etc.).
export function safeUrl(u) {
  const s = String(u || "").trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : "";
}

// Dates are stored as "YYYY-MM-DD" strings. Parse at noon to avoid time-zone slips.
export function fmtDate(iso, opts) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-CA", opts);
}

export function todayIso() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function initials(name) {
  return String(name || "?").trim().split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();
}

export function slotId(date, slot, bay) {
  return date + "_" + slot + "_" + bay;
}

let toastTimer;
export function toast(msg, kind) {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = "toast show" + (kind === "error" ? " error" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast"; }, 4200);
}

export function friendlyError(err) {
  const code = (err && err.code) || "";
  const map = {
    "auth/invalid-credential": "That email and password don't match an account.",
    "auth/wrong-password": "That email and password don't match an account.",
    "auth/user-not-found": "That email and password don't match an account.",
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/email-already-in-use": "There's already an account with that email. Try signing in.",
    "auth/weak-password": "Pick a password with at least 8 characters.",
    "auth/too-many-requests": "Too many tries. Wait a few minutes and try again.",
    "auth/network-request-failed": "Can't reach the server. Check your connection.",
    "permission-denied": "You don't have permission to do that.",
    "unavailable": "Can't reach the server. Check your connection."
  };
  return map[code] || (err && err.message) || "Something went wrong. Try again.";
}

// Resolve the signed-in player. Sends visitors who aren't members back to the sign-in page.
// Returns { user, profile, isAdmin }.
export function requireMember({ adminOnly = false } = {}) {
  return new Promise((resolve) => {
    if (configMissing) {
      document.body.innerHTML = '<p style="font:16px system-ui;padding:40px">The site isn\'t connected to Firebase yet. Paste your Firebase config into <code>config.js</code> (SETUP.md, step 4).</p>';
      return;
    }
    const stop = onAuthStateChanged(auth, async (user) => {
      stop();
      if (!user) { location.replace("index.html"); return; }
      try {
        const [p, a] = await Promise.all([
          getDoc(doc(db, "players", user.uid)),
          getDoc(doc(db, "admins", user.uid))
        ]);
        const isAdmin = a.exists();
        if (!p.exists() && !isAdmin) { location.replace("index.html?finish=1"); return; }
        if (adminOnly && !isAdmin) { location.replace("book.html"); return; }
        const profile = p.exists() ? p.data() : { name: user.email, email: user.email, phone: "" };
        resolve({ user, profile, isAdmin });
      } catch (err) {
        toast(friendlyError(err), "error");
      }
    });
  });
}

export function wireSignOut() {
  document.querySelectorAll("[data-signout]").forEach((b) =>
    b.addEventListener("click", async () => { await signOut(auth); location.replace("index.html"); })
  );
}
