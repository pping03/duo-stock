// Cloudflare Pages Function → GET /api/temp-key?key=free
// 用临时密钥 "free" 换取 1 小时有效的会话 token
import { createTempToken, TEMP_KEY } from "../../lib/stock.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || request.headers.get("x-access-key");
  if (key !== TEMP_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "临时密钥错误（请输入 free）" }), {
      status: 401, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  const { token, expiresAt } = await createTempToken(env);
  return new Response(JSON.stringify({ ok: true, token, expiresAt, ttlSeconds: 3600 }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
