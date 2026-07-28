// ============================================================================
//  metricsStore — player profile (localStorage) + shared metrics (Firebase
//  Realtime Database).
//
//  The player's name lives forever in localStorage on their own device. Every
//  completed hand bumps their all-time count and is (best-effort) synced to a
//  shared Realtime Database "players" node so the metrics page can aggregate
//  all players across devices.
//
//  We talk to the Realtime Database over its REST API with `fetch` (no SDK).
//  The config below is SAFE to ship publicly — Firebase web config values are
//  not secrets; access is governed by database security rules (see README).
//
//  Realtime Database rules required (Console → Realtime Database → Rules):
//    { "rules": { "players": { ".read": true, ".write": true } } }
//  (Open rules are fine for a small friends' app; lock down later if needed.)
// ============================================================================
export const FIREBASE = {
  databaseURL: "https://pokertraining-c9884-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "pokertraining-c9884",
  apiKey: "AIzaSyChHi-0fBvzIb7DYlWcpJQcANCGeZnRPTI",
};

export const isConfigured = () => Boolean(FIREBASE.databaseURL);

export const DAY_MS = 24 * 60 * 60 * 1000;
const PKEY = "uth:profile:v1";
const nodeUrl = (path) => `${FIREBASE.databaseURL}/${path}.json`;

// Local calendar day key "YYYY-MM-DD" for grouping the daily-progress history.
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const uuid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

// --------------------------------------------------------------------------
//  Local profile
// --------------------------------------------------------------------------
export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(PKEY));
    if (p && p.deviceId && p.name) return p;
  } catch { /* ignore */ }
  return null;
}
function saveProfile(p) {
  try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch { /* ignore */ }
}
export function createProfile(name) {
  const p = {
    deviceId: uuid(),
    name: String(name).trim().slice(0, 24) || "Player",
    handsAllTime: 0,
    lastHandTs: 0,
    recentHands: [], // timestamps within the last 24h
    timeSumAll: 0, // total decision time (ms) across all hands
    correctAll: 0, // hands landed on the correct side of 21
    daily: {},     // "YYYY-MM-DD" -> { hands, correct, exact, exactTimeMs }
  };
  saveProfile(p);
  return p;
}

// Record one completed hand: update local storage + push to the database.
// `outcome` = { correct, exact, timeMs } for the just-decided hand.
export function recordHand(profile, outcome = {}) {
  if (!profile) return profile;
  const now = Date.now();
  const timeMs = Number(outcome.timeMs) || 0;
  const correct = outcome.correct ? 1 : 0;
  const exact = outcome.exact ? 1 : 0;
  const recentHands = [...(profile.recentHands || []), now].filter((t) => now - t < DAY_MS);

  // roll today's bucket in the daily-progress history
  const key = dayKey(now);
  const prevDay = (profile.daily || {})[key] || { hands: 0, correct: 0, exact: 0, exactTimeMs: 0 };
  const daily = {
    ...(profile.daily || {}),
    [key]: {
      hands: prevDay.hands + 1,
      correct: prevDay.correct + correct,
      exact: prevDay.exact + exact,
      exactTimeMs: prevDay.exactTimeMs + (exact ? timeMs : 0),
    },
  };

  const next = {
    ...profile,
    handsAllTime: (profile.handsAllTime || 0) + 1,
    lastHandTs: now,
    recentHands,
    timeSumAll: (profile.timeSumAll || 0) + timeMs,
    correctAll: (profile.correctAll || 0) + correct,
    daily,
  };
  saveProfile(next);
  pushPlayer(next); // fire-and-forget
  return next;
}

// --------------------------------------------------------------------------
//  Realtime Database REST (plain JSON)
// --------------------------------------------------------------------------
const toArray = (rh) => (Array.isArray(rh) ? rh.filter((x) => x != null) : rh ? Object.values(rh) : []);

async function pushPlayer(p) {
  if (!isConfigured()) return;
  try {
    await fetch(nodeUrl(`players/${encodeURIComponent(p.deviceId)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: p.name,
        handsAllTime: p.handsAllTime || 0,
        lastHandTs: p.lastHandTs || 0,
        recentHands: p.recentHands || [],
        timeSumAll: p.timeSumAll || 0,
        correctAll: p.correctAll || 0,
        daily: p.daily || {},
      }),
    });
  } catch { /* offline / rules — ignore */ }
}

// Fetch every player. Falls back to the local profile when not configured.
export async function fetchAllPlayers() {
  if (!isConfigured()) {
    const p = loadProfile();
    return p ? [{ ...p, id: p.deviceId }] : [];
  }
  const res = await fetch(nodeUrl("players"));
  if (!res.ok) throw new Error(`Realtime DB ${res.status}`);
  const data = await res.json(); // { deviceId: {...}, ... } | null
  return Object.entries(data || {}).map(([id, v]) => ({
    id,
    name: v?.name || "(unknown)",
    handsAllTime: Number(v?.handsAllTime || 0),
    lastHandTs: Number(v?.lastHandTs || 0),
    recentHands: toArray(v?.recentHands),
    timeSumAll: Number(v?.timeSumAll || 0),
    correctAll: Number(v?.correctAll || 0),
    daily: v?.daily || {},
  }));
}
