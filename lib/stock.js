/**
 * 共享库存查询模块 —— 同时供 Vercel Function 与 Cloudflare Pages Function 使用
 * 数据源: https://www.apple.com.cn/shop/retail/pickup-message （官网"查看供货情况"同源接口）
 */

const TARGET_STORES = [
  ["R637", "天津"], // 天津大悦城
  ["R638", "天津"], // 天津万象城
  ["R579", "天津"], // 天津恒隆广场
  ["R320", "北京"], // 三里屯
  ["R388", "北京"], // 西单大悦城
  ["R448", "北京"], // 王府井
  ["R479", "北京"], // 华贸购物中心
  ["R645", "北京"], // 朝阳大悦城
  ["R792", "北京"], // 北京荟聚
];
const TARGET_IDS = new Set(TARGET_STORES.map(([id]) => id));

const BUY_URL = "https://www.apple.com.cn/shop/buy-iphone/iphone-duo";
const UPSTREAM = "https://www.apple.com.cn/shop/retail/pickup-message";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const CACHE_TTL_MS = 2000;

let cache = { ts: 0, data: null };

const stripHtml = (s) => (s || "").replace(/<[^>]+>/g, "").trim();

export async function fetchStock(env = {}, { force = false } = {}) {
  const PART = env.PART || "MK2P4CH/A";
  const PRODUCT = env.PRODUCT || "iPhone Duo 512GB 星光白色";
  const LOCATION = env.LOCATION || "100000";

  const now = Date.now();
  if (!force && cache.data && now - cache.ts < CACHE_TTL_MS) {
    return { ...cache.data, cached: true };
  }

  const qs = new URLSearchParams({ pl: "true", "parts.0": PART, location: LOCATION });
  let resp, raw;
  try {
    resp = await fetch(`${UPSTREAM}?${qs}`, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Referer: "https://www.apple.com.cn/shop/buy-iphone/iphone-duo",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    raw = await resp.text();
  } catch (e) {
    return { ok: false, fetchedAt: Date.now(), stores: [], error: `网络请求失败：${e.message}` };
  }

  if (!resp.ok) {
    return {
      ok: false,
      fetchedAt: Date.now(),
      stores: [],
      error: `苹果接口返回 HTTP ${resp.status}（可能是机房 IP 被风控），稍后自动重试`,
    };
  }

  let doc, storesRaw;
  try {
    doc = JSON.parse(raw);
    storesRaw = doc.body.stores;
  } catch {
    return {
      ok: false,
      fetchedAt: Date.now(),
      stores: [],
      error: "苹果接口返回了非预期内容（可能被风控拦截），稍后自动重试",
    };
  }

  const byId = {};
  const extras = [];
  for (const s of storesRaw) {
    const pa = (s.partsAvailability || {})[PART] || {};
    const msg = ((pa.messageTypes || {}).regular) || {};
    const item = {
      storeNumber: s.storeNumber || "",
      storeName: s.storeName || "",
      city: s.city || "",
      state: s.state || "",
      available: pa.pickupDisplay === "available",
      pickupDisplay: pa.pickupDisplay || "",
      pickupType: pa.pickupType || "",
      quote: stripHtml(pa.pickupSearchQuote || msg.storePickupQuote || ""),
      pickupLinkText: msg.storePickupLinkText || "",
      reservationUrl: s.reservationUrl || BUY_URL,
    };
    if (TARGET_IDS.has(item.storeNumber)) byId[item.storeNumber] = item;
    else extras.push(item);
  }

  const stores = TARGET_STORES.map(([id, city]) => byId[id] || {
    storeNumber: id, storeName: id, city, available: false,
    pickupDisplay: "unknown", quote: "接口未返回该门店", reservationUrl: BUY_URL,
  });

  const data = {
    ok: true,
    fetchedAt: Date.now(),
    part: PART,
    product: PRODUCT,
    price: 17999,
    buyUrl: BUY_URL,
    location: LOCATION,
    anyAvailable: stores.some((s) => s.available),
    stores,
    extraStores: extras,
  };
  cache = { ts: Date.now(), data };
  return data;
}

export { TARGET_STORES, BUY_URL };
