// Vercel Serverless Function → GET /api/temp-key?key=free
// 用临时密钥 "free" 换取 1 小时有效的会话 token
// 注意："free" 本身不能直接访问 /api/stock 或 /api/duo（会返回 401），只能换 token
import { createTempToken, TEMP_KEY } from "../lib/stock.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  const key = req.query.key || req.headers["x-access-key"];
  if (key !== TEMP_KEY) {
    res.status(401).json({ ok: false, error: "临时密钥错误（请输入 free）" });
    return;
  }
  const { token, expiresAt } = await createTempToken(process.env);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ ok: true, token, expiresAt, ttlSeconds: 3600 });
}
