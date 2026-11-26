import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, doc, getDoc, setDoc, serverTimestamp
} from "./firebase.js";
import { auth, db, configMissing, friendlyError, toast } from "./common.js";

const $ = (id) => document.getElementById(id);
const signinView = $("signin-view");
const signupForm = $("signup-form");

function showError(id, msg) {
  const el = $(id);
  el.textContent = msg;
  el.classList.toggle("hidden", !msg);
}
function busy(btn, on, label) {
  btn.disabled = on;
  if (label) btn.textContent = label;
}
function show(view) {
  const up = view === "signup";
  signinView.classList.toggle("hidden", up);
  signupForm.classList.toggle("hidden", !up);
  showError("signin-error", "");
  showError("signup-error", "");
  (up ? $("su-name") : $("si-email")).focus();
}

$("to-signup").addEventListener("click", () => show("signup"));
$("to-signin").addEventListener("click", () => show("signin"));

async function hasAccess(uid) {
  const [p, a] = await Promise.all([getDoc(doc(db, "players", uid)), getDoc(doc(db, "admins", uid))]);
  return p.exists() || a.exists();
}

if (configMissing) {
  showError("signin-error", "The site isn't connected to Firebase yet. Paste your Firebase config into config.js (SETUP.md, step 4).");
} else {
  // Already signed in? Go straight to booking.
  const stop = onAuthStateChanged(auth, async (user) => {
    stop();
    if (!user) return;
    try {
      if (await hasAccess(user.uid)) location.replace("book.html");
      else await signOut(auth);
    } catch { /* stay on the sign-in page */ }
  });
}

$("signin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("si-email").value.trim();
  const pass = $("si-pass").value;
  if (!email || !pass) { showError("signin-error", "Enter your email and password."); return; }
  const btn = $("si-btn");
  busy(btn, true, "Signing in…");
  showError("signin-error", "");
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    if (await hasAccess(cred.user.uid)) { location.replace("book.html"); return; }
    await signOut(auth);
    showError("signin-error", "This login isn't linked to a league account yet. Use Create account with the league password.");
  } catch (err) {
    showError("signin-error", friendlyError(err));
  }
  busy(btn, false, "Sign in");
});

$("forgot").addEventListener("click", async () => {
  const email = $("si-email").value.trim();
  if (!email) { showError("signin-error", "Type your email above, then tap Forgot password."); $("si-email").focus(); return; }
  try {
    await sendPasswordResetEmail(auth, email);
  } catch { /* don't reveal whether the email exists */ }
  showError("signin-error", "");
  toast("If that email has an account, a reset link is on its way. Check your spam folder too.");
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("su-name").value.trim().replace(/\s+/g, " ");
  const email = $("su-email").value.trim();
  const phone = $("su-phone").value.trim();
  const pass = $("su-pass").value;
  const code = $("su-code").value.trim();
  if (!name || !email || !phone || !pass || !code) { showError("signup-error", "Fill in every field, including the league password."); return; }
  if (name.length > 40) { showError("signup-error", "Keep your calendar name under 40 characters."); return; }
  if (pass.length < 8) { showError("signup-error", "Pick a password with at least 8 characters."); return; }

  const btn = $("su-btn");
  busy(btn, true, "Creating account…");
  showError("signup-error", "");

  let user, isNew = false;
  try {
    user = (await createUserWithEmailAndPassword(auth, email, pass)).user;
    isNew = true;
  } catch (err) {
    if (err.code !== "auth/email-already-in-use") { showError("signup-error", friendlyError(err)); busy(btn, false, "Create account"); return; }
    // Recover a half-finished sign-up: same email + password, but no league profile yet.
    try {
      user = (await signInWithEmailAndPassword(auth, email, pass)).user;
      if (await hasAccess(user.uid)) { location.replace("book.html"); return; }
    } catch {
      showError("signup-error", "There's already an account with that email. Use Sign in, or Forgot password.");
      busy(btn, false, "Create account");
      return;
    }
  }

  try {
    await setDoc(doc(db, "players", user.uid), {
      name, email: user.email, phone, joinCode: code, createdAt: serverTimestamp()
    });
    location.replace("book.html");
  } catch (err) {
    // Wrong league password: Firestore rules refuse the profile. Don't leave a stray login behind.
    if (isNew) { try { await user.delete(); } catch { /* ignore */ } }
    else { try { await signOut(auth); } catch { /* ignore */ } }
    showError("signup-error", err.code === "permission-denied"
      ? "That league password isn't right. Check with the organizer."
      : friendlyError(err));
    busy(btn, false, "Create account");
  }
});
