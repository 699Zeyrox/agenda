// Fonction planifiée : chaque minute, envoie un push pour les événements à rappeler.
import { getStore } from "@netlify/blobs";
import webpush from "web-push";

const LEAD_MIN = 10;     // rappel 10 min avant les événements avec heure
const ALL_DAY_HOUR = 8;  // événements sans heure : rappel à 8h le jour même

// Décalage (ms) entre l'heure locale du fuseau `tz` et UTC à l'instant `ts`
function tzOffset(ts, tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(ts)).map((x) => [x.type, x.value])
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ts / 1000) * 1000;
}
// Convertit une date/heure locale (dans `tz`) en timestamp UTC
function zonedToUtc(y, m, d, h, mi, tz) {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const t = guess - tzOffset(guess, tz);
  return guess - tzOffset(t, tz);
}
const validTz = (tz) => { try { new Intl.DateTimeFormat("fr", { timeZone: tz }); return tz; } catch { return "UTC"; } };
const cut = (s, n) => String(s ?? "").slice(0, n);

async function handleUser(store, uid, now) {
  const rec = await store.get("s:" + uid, { type: "json" });
  if (!rec?.subs?.length) return;
  const events = (await store.get("e:" + uid, { type: "json" })) || [];
  const done = new Set((await store.get("n:" + uid, { type: "json" })) || []);
  const tz = validTz(rec.tz || "UTC");

  const keys = new Set(), todo = [];
  for (const e of events) {
    const [y, m, d] = e.date.split("-").map(Number);
    const k = e.id + "|" + e.date + "|" + e.time;
    keys.add(k);
    let start, due;
    if (e.time) {
      const [h, mi] = e.time.split(":").map(Number);
      start = zonedToUtc(y, m, d, h, mi, tz); due = start - LEAD_MIN * 60000;
    } else {
      due = zonedToUtc(y, m, d, ALL_DAY_HOUR, 0, tz); start = zonedToUtc(y, m, d + 1, 0, 0, tz);
    }
    if (now >= due && now < start && !done.has(k)) todo.push({ e, k });
  }

  let doneChanged = false, recChanged = false;
  for (const { e, k } of todo) {
    const payload = JSON.stringify({
      title: cut(e.title, 100),
      body: (e.time ? "À " + e.time : "Aujourd'hui") + (e.note ? " · " + cut(e.note, 150) : ""),
      tag: k,
    });
    let ok = false;
    const gone = new Set();
    await Promise.all(rec.subs.map(async (s) => {
      try { await webpush.sendNotification(s, payload, { TTL: 600, urgency: "high" }); ok = true; }
      catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) gone.add(s.endpoint);
        else console.error("push error", err.statusCode || err.message);
      }
    }));
    if (gone.size) { rec.subs = rec.subs.filter((s) => !gone.has(s.endpoint)); recChanged = true; }
    if (ok || !rec.subs.length) { done.add(k); doneChanged = true; }
  }

  if (recChanged) rec.subs.length ? await store.setJSON("s:" + uid, rec) : await store.delete("s:" + uid);
  const kept = events.length ? [...done].filter((k) => keys.has(k)) : [...done];
  if (doneChanged || kept.length !== done.size) await store.setJSON("n:" + uid, kept);
}

export default async () => {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) { console.error("VAPID_* non configurées"); return; }
  webpush.setVapidDetails(VAPID_SUBJECT || "https://agendavz.netlify.app", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const store = getStore({ name: "agenda", consistency: "strong" });
  const now = Date.now();
  const { blobs } = await store.list({ prefix: "s:" });
  for (const { key } of blobs) {
    try { await handleUser(store, key.slice(2), now); } catch (err) { console.error("notify", err?.message); }
  }
};

export const config = { schedule: "* * * * *" };
