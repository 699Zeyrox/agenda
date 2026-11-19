
import { getStore } from "@netlify/blobs";
import webpush from "web-push";

webpush.setVapidDetails(
  Netlify.env.get("VAPID_SUBJECT"),
  Netlify.env.get("VAPID_PUBLIC_KEY"),
  Netlify.env.get("VAPID_PRIVATE_KEY")
);

const LEAD_MINUTES = 10; // prévenir X minutes avant

// ADAPTER : seul endroit dépendant de TA structure de données.
// Doit renvoyer [{ id, title, start }] avec start = date ISO AVEC fuseau
// (ex. "2026-11-20T14:30:00+01:00").
async function loadEvents() {
  const data = await getStore("agenda").get("events", { type: "json" });
  return Array.isArray(data) ? data : [];
}

export default async () => {
  const now = Date.now();
  const events = await loadEvents();
  const notified = getStore("notified");
  const subsStore = getStore("push-subs");

  const { blobs } = await subsStore.list();
  const subs = await Promise.all(
    blobs.map(async (b) => ({ key: b.key, sub: await subsStore.get(b.key, { type: "json" }) }))
  );

  for (const ev of events) {
    const start = new Date(ev.start).getTime();
    if (Number.isNaN(start)) continue;
    const msUntil = start - now;
    if (msUntil > LEAD_MINUTES * 60_000 || msUntil < -5 * 60_000) continue;
    const nKey = `${ev.id}:${ev.start}`;
    if (await notified.get(nKey)) continue;

    const payload = JSON.stringify({
      title: ev.title,
      body: msUntil > 0
        ? `Commence dans ${Math.max(1, Math.round(msUntil / 60_000))} min`
        : "Commence maintenant",
      tag: nKey,
      url: "/",
    });

    for (const { key, sub } of subs) {
      if (!sub) continue;
      try {
        await webpush.sendNotification(sub, payload);
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) await subsStore.delete(key);
        else console.error("push error", err?.statusCode, err?.body);
      }
    }
    await notified.set(nKey, String(now));
  }
};

export const config = { schedule: "* * * * *" };
