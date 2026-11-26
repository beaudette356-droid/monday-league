// ─────────────────────────────────────────────────────────────
//  The Bunker East – Monday League · site settings
//  Firebase project: bunker-east-league
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyCd5PLHNXy6nrJwTyIK0X0vBcuQcIAHT0o",
  authDomain: "bunker-east-league.firebaseapp.com",
  projectId: "bunker-east-league",
  storageBucket: "bunker-east-league.firebasestorage.app",
  messagingSenderId: "487948313319",
  appId: "1:487948313319:web:10a1e463ceee9eb44a7842"
};

// League layout. Change labels here if the bays or times ever change.
export const LEAGUE = {
  name: "The Bunker East",
  subtitle: "Monday League",
  season: "Season 3",
  venue: "Carlsbad Springs",
  maxPerBay: 4,
  bays: [3, 4],
  slots: [
    { id: "early", name: "Early tee time", short: "5", time: "5 – 8 PM" },
    { id: "late",  name: "Late tee time",  short: "8", time: "8 – 11 PM" }
  ]
};
