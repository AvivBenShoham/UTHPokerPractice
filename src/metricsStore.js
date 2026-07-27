// ============================================================================
//  metricsStore — player profile (localStorage) + shared metrics (Firestore).
//
//  The player's name lives forever in localStorage on their own device. Every
//  completed hand bumps their all-time count and is (best-effort) synced to a
//  shared Firestore "players" collection so the metrics page can aggregate all
//  players across devices.
//
//  We talk to Firestore over its REST API with `fetch` (no SDK/dependency).
//  Both values below are SAFE to ship publicly — a Firebase web apiKey is not
//  a secret; access is governed by Firestore security rules (see README).
//
//  >>> TO ENABLE CROSS-DEVICE METRICS: create a free Firebase project, enable
//      Cloud Firestore, and paste the two values here. Until then the app runs
//      device-local (the metrics page shows only this browser's player).
// ============================================================================
export const FIREBASE = {
  
apiKey: “AIzaSyChHi-0fBvzIb7DYlWcpJQcANCGeZnRPTI”,
authDomain: “pokertraining-c9884.firebaseapp.com”,
databaseURL: “https://pokertraining-c9884-default-rtdb.europe-west1.firebasedatabase.app”,
projectId: “pokertraining-c9884”,
storageBucket: “pokertraining-c9884.firebasestorage.app”,
messagingSenderId: “264063940743”,
appId: “1:264063940743:web:ab961bbbe483cdd016a022”
};

export const isConfigured = () => Boolean(FIREBASE.projectId && FIREBASE.apiKey);

export const DAY_MS = 24 * 60 * 60 * 1000;
const PKEY = "uth:profile:v1";
const docsBase = () =>
  `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;

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
  };
  saveProfile(p);
  return p;
}

// Record one completed hand: update local storage + push to Firestore.
export function recordHand(profile) {
  if (!profile) return profile;
  const now = Date.now();
  const recentHands = [...(profile.recentHands || []), now].filter((t) => now - t < DAY_MS);
  const next = {
    ...profile,
    handsAllTime: (profile.handsAllTime || 0) + 1,
    lastHandTs: now,
    recentHands,
  };
  saveProfile(next);
  pushPlayer(next); // fire-and-forget
  return next;
}

// --------------------------------------------------------------------------
//  Firestore REST encode / decode
// --------------------------------------------------------------------------
function encode(p) {
  return {
    fields: {
      name: { stringValue: p.name },
      handsAllTime: { integerValue: String(p.handsAllTime || 0) },
      lastHandTs: { integerValue: String(p.lastHandTs || 0) },
      recentHands: {
        arrayValue: {
          values: (p.recentHands || []).map((t) => ({ integerValue: String(t) })),
        },
      },
    },
  };
}
function decode(doc) {
  const f = doc.fields || {};
  const vals = f.recentHands?.arrayValue?.values || [];
  return {
    id: doc.name.split("/").pop(),
    name: f.name?.stringValue || "(unknown)",
    handsAllTime: Number(f.handsAllTime?.integerValue || 0),
    lastHandTs: Number(f.lastHandTs?.integerValue || 0),
    recentHands: vals.map((v) => Number(v.integerValue || 0)),
  };
}

async function pushPlayer(p) {
  if (!isConfigured()) return;
  try {
    const url = `${docsBase()}/players/${encodeURIComponent(p.deviceId)}?key=${FIREBASE.apiKey}`;
    await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(encode(p)),
    });
  } catch { /* offline / rules — ignore */ }
}

// Fetch every player. Falls back to the local profile when not configured.
export async function fetchAllPlayers() {
  if (!isConfigured()) {
    const p = loadProfile();
    return p ? [{ ...p, id: p.deviceId }] : [];
  }
  const out = [];
  let pageToken = "";
  do {
    const url =
      `${docsBase()}/players?pageSize=300` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "") +
      `&key=${FIREBASE.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Firestore ${res.status}`);
    const data = await res.json();
    (data.documents || []).forEach((d) => out.push(decode(d)));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return out;
}
