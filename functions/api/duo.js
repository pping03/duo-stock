// Cloudflare Pages Function → GET /api/duo
// 仅返回 iPhone Duo 各颜色/内存的天津北京门店库存（简洁格式）
// 加 ?verbose=1 返回完整格式
import { fetchStock, toBrief, DUO_MODELS, checkAuth } from "../../lib/stock.js";

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
  const data = await fetchStock(context.env, { force: url.searchParams.get("force") === "1", models: DUO_MODELS });
  return json(url.searchParams.get("verbose") === "1" ? data : toBrief(data));
}
