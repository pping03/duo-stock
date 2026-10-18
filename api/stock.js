// Vercel Serverless Function → GET /api/stock
import { fetchStock } from "../lib/stock.js";

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
  const data = await fetchStock(process.env, { force: req.query.force === "1" });
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(data);
}
