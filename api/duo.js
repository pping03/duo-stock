// Vercel Serverless Function → GET /api/duo
// 仅返回 iPhone Duo 各颜色/内存的天津北京门店库存
import { fetchStock, DUO_MODELS } from "../lib/stock.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }
  const key = req.query.key || req.headers["x-access-key"];
  if (process.env.ACCESS_KEY && key !== process.env.ACCESS_KEY) {
    res.status(401).json({ ok: false, error: "访问密钥错误或未提供（?key=你的密钥）" });
    return;
  }
  const data = await fetchStock(process.env, { force: req.query.force === "1", models: DUO_MODELS });
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(data);
}
