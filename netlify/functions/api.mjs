import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

const json = (d, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hmac = (body) => crypto.createHmac("sha256", process.env.JWT_SECRET).update(body).digest("base64url");

function sign(uid, remember = false) {
  const days = remember ? 30 : 1;
  const body = Buffer.from(JSON.stringify({ uid, exp: Date.now() + days * 864e5 })).toString("base64url");
  return body + "." + hmac(body);
}
function verify(token) {
  try {
    const [body, sig] = (token || "").split(".");
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac(body)))) return null;
    const p = JSON.parse(Buffer.from(body, "base64url"));
    return p.exp > Date.now() ? p.uid : null;
  } catch { return null; }
}
const hashPw = (pw) => {
  const salt = crypto.randomBytes(16);
  return salt.toString("hex") + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
};
const checkPw = (pw, stored) => {
  const [s, h] = stored.split(":");
  const test = crypto.scryptSync(pw, Buffer.from(s, "hex"), 64);
  return crypto.timingSafeEqual(test, Buffer.from(h, "hex"));
};
const str = (v, n) => String(v ?? "").slice(0, n);

export default async (req) => {
  if (!process.env.JWT_SECRET) return json({ error: "JWT_SECRET n'est pas configuré sur Netlify." }, 500);
  const route = new URL(req.url).pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const store = getStore({ name: "agenda", consistency: "strong" });

  if (route === "register" || route === "login") {
    if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);
    const { email = "", password = "", remember = false } = await req.json().catch(() => ({}));
    const keep = remember === true;
    const mail = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) || mail.length > 200) return json({ error: "Adresse e-mail invalide." }, 400);
    const uid = sha(mail);
    const user = await store.get("u:" + uid, { type: "json" });
    if (route === "register") {
      if (String(password).length < 8) return json({ error: "Le mot de passe doit faire au moins 8 caractères." }, 400);
      if (user) return json({ error: "Un compte existe déjà avec cet e-mail." }, 409);
      await store.setJSON("u:" + uid, { email: mail, pass: hashPw(String(password)), created: Date.now() });
      return json({ token: sign(uid, keep), email: mail });
    }
    if (!user || !checkPw(String(password), user.pass)) return json({ error: "E-mail ou mot de passe incorrect." }, 401);
    return json({ token: sign(uid, keep), email: mail });
  }

  if (route === "events") {
    const uid = verify((req.headers.get("authorization") || "").slice(7));
    if (!uid) return json({ error: "Session expirée, reconnecte-toi." }, 401);
    if (req.method === "GET") return json((await store.get("e:" + uid, { type: "json" })) || []);
    if (req.method === "PUT") {
      const list = await req.json().catch(() => null);
      if (!Array.isArray(list) || list.length > 2000) return json({ error: "Données invalides." }, 400);
      const clean = list
        .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e?.date))
        .map((e) => ({
          id: str(e.id, 40), date: e.date,
          time: /^\d{2}:\d{2}$/.test(e.time) ? e.time : "",
          title: str(e.title, 200) || "Sans titre", note: str(e.note, 1000),
        }));
      await store.setJSON("e:" + uid, clean);
      return json(clean);
    }
  }
  return json({ error: "Introuvable" }, 404);
};

export const config = { path: "/api/*" };
