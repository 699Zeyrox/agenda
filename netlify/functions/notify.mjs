import { getStore } from "@netlify/blobs";
import webpush from "web-push";

const LEAD_MIN = 10;      // rappel 10 min avant (même réglage que la page)
const ALL_DAY_HOUR = 8;   // événements sans heure : 8h le jour même

// Décalage (ms) entre l'heure locale d'un fuseau et UTC pour un instant donné
function tzOffset(ms, tz) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms)).map((x) => [x.type, x.value])
  );
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
// "YYYY-MM-DD" + heure/minute dans le fuseau tz -> timestamp UTC
function localToUtc(date, h, mi, tz) {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - tzOffset(guess, tz);
  t = guess - tzOffset(t, tz);
  return t;
}
const validTz = (tz) => { try { new Intl.DateTimeFormat("fr", { timeZone: tz }); return tz; } catch { return "UTC"; } };

export default async () => {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) { console.error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquantes"); return; }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://agendavz.netlify.app", pub, priv);

  const store = getStore({ name: "agenda", consistency: "strong" });
  const now = Date.now();
  const { blobs } = await store.list({ prefix: "s:" });

  for (const { key } of blobs) {
    const uid = key.slice(2);
    const rec = await store.get(key, { type: "json" });
    if (!rec || !Array.isArray(rec.subs) || !rec.subs.length) continue;
    const events = (await store.get("e:" + uid, { type: "json" })) || [];
    const tz = validTz(rec.tz || "UTC");

    let sent;
    try { sent = new Set((await store.get("n:" + uid, { type: "json" })) || []); } catch { sent = new Set(); }
    const keys = new Set();
    let changed = false, subs = rec.subs, subsChanged = false;

    for (const e of events) {
      const k = e.id + "|" + e.date + "|" + e.time;
      keys.add(k);
      if (sent.has(k)) continue;

      let due, end;
      if (e.time) {
        const [h, mi] = e.time.split(":").map(Number);
        const start = localToUtc(e.date, h, mi, tz);
        due = start - LEAD_MIN * 60000; end = start;
      } else {
        due = localToUtc(e.date, ALL_DAY_HOUR, 0, tz);
        end = due + 16 * 3600000; // jusqu'en fin de journée
      }
      if (!(now >= due && now < end)) continue;

      const payload = JSON.stringify({
        title: e.title,
        body: (e.time ? "À " + e.time : "Aujourd'hui") + (e.note ? " · " + e.note : ""),
        tag: k, url: "/",
      });
      let ok = false;
      for (const s of [...subs]) {
        try { await webpush.sendNotification(s, payload, { TTL: 3600 }); ok = true; }
        catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) { subs = subs.filter((x) => x.endpoint !== s.endpoint); subsChanged = true; }
          else console.error("push error", err.statusCode, err.body);
        }
      }
      if (ok || !subs.length) { sent.add(k); changed = true; }
    }

    const kept = [...sent].filter((k) => keys.has(k));
    if (changed || kept.length !== sent.size) await store.setJSON("n:" + uid, kept);
    if (subsChanged) subs.length ? await store.setJSON(key, { ...rec, subs }) : await store.delete(key);
  }
};

export const config = { schedule: "* * * * *" };
