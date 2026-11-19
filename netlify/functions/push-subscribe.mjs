
import { getStore } from "@netlify/blobs";
import { createHash } from "node:crypto";

export default async (req) => {
  const sub = await req.json();
  if (!sub?.endpoint || !sub?.keys) return new Response("Bad subscription", { status: 400 });
  const id = createHash("sha256").update(sub.endpoint).digest("hex");
  await getStore("push-subs").setJSON(id, sub);
  return Response.json({ ok: true });
};

export const config = { path: "/push/subscribe", method: "POST" };
