

export default async () => Response.json({ key: Netlify.env.get("VAPID_PUBLIC_KEY") });

export const config = { path: "/push/public-key", method: "GET" };
