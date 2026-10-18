// Cloudflare Pages Function → GET /api/stock
import { fetchStock, checkAuth } from "../../lib/stock.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get("key") || context.request.headers.get("x-access-key");
  const auth = await checkAuth(key, context.env);
  if (!auth.ok) {
    return json({ ok: false, error: "访问密钥错误、已过期或未提供（?key=你的密钥）" }, 401);
  }
  const data = await fetchStock(context.env, { force: url.searchParams.get("force") === "1" });
  return json(data);
}
