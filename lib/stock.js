/**
 * 共享库存查询模块 —— 同时供 Vercel Function 与 Cloudflare Pages Function 使用
 * 数据源: https://www.apple.com.cn/shop/retail/pickup-message （官网"查看供货情况"同源接口）
 *
 * 验证记录（2026-10-18）:
 * - 接口可用：HTTP 200，返回 JSON；pickup-message 不像 fulfillment-messages 那样屏蔽非中国区 IP
 * - 查询 ?pl=true&parts.0=MK2P4CH/A&location=100000 一次返回北京 6 家 + 天津 3 家共 9 家门店
 * - 9 个门店编号逐一验证通过（见 TARGET_STORES）
 * - 返回结构: body.stores[].{storeNumber, storeName, city, partsAvailability[PART].pickupDisplay}
 *   pickupDisplay === "available" 表示有货可取
 */

const TARGET_STORES = [
  ["R637", "天津"], // 天津大悦城 ✓ 已验证
  ["R638", "天津"], // 天津万象城 ✓ 已验证
  ["R579", "天津"], // 天津恒隆广场 ✓ 已验证
  ["R320", "北京"], // 三里屯 ✓ 已验证
  ["R388", "北京"], // 西单大悦城 ✓ 已验证
  ["R448", "北京"], // 王府井 ✓ 已验证
  ["R479", "北京"], // 华贸购物中心 ✓ 已验证
  ["R645", "北京"], // 朝阳大悦城 ✓ 已验证
  ["R792", "北京"], // 北京荟聚 ✓ 已验证
];
const TARGET_IDS = new Set(TARGET_STORES.map(([id]) => id));

const BUY_URL = "https://www.apple.com.cn/shop/buy-iphone/iphone-duo";
const UPSTREAM = "https://www.apple.com.cn/shop/retail/pickup-message";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const CACHE_TTL_MS = 2000;

let cache = { ts: 0, data: null };

const stripHtml = (s) => (s || "").replace(/<[^>]+>/g, "").trim();

function baseHeaders() {
  return {
    "User-Agent": UA,
    Accept: "application/json, text/javascript, */*; q=0.01",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: "https://www.apple.com.cn/shop/buy-iphone/iphone-duo",
    "X-Requested-With": "XMLHttpRequest",
  };
}

async function queryUpstream(params) {
  const qs = new URLSearchParams(params);
  const resp = await fetch(`${UPSTREAM}?${qs}`, { headers: baseHeaders() });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const doc = await resp.json();
  const stores = doc && doc.body && doc.body.stores;
  if (!Array.isArray(stores)) {
    throw new Error("unexpected-response");
  }
  return stores;
}

function normalizeStore(s, PART, fallbackCity) {
  const pa = (s.partsAvailability || {})[PART] || {};
  const msg = (pa.messageTypes || {}).regular || {};
  return {
    storeNumber: s.storeNumber || "",
    storeName: s.storeName || "",
    city: s.city || fallbackCity || "",
    state: s.state || "",
    available: pa.pickupDisplay === "available",
    pickupDisplay: pa.pickupDisplay || "",
    pickupType: pa.pickupType || "",
    quote: stripHtml(pa.pickupSearchQuote || msg.storePickupQuote || ""),
    pickupLinkText: msg.storePickupLinkText || "",
    reservationUrl: s.reservationUrl || BUY_URL,
  };
}

export async function fetchStock(env = {}, { force = false } = {}) {
  const PART = env.PART || "MK2P4CH/A";
  const PRODUCT = env.PRODUCT || "iPhone Duo 512GB 星光白色";
  const LOCATION = env.LOCATION || "100000";

  const now = Date.now();
  if (!force && cache.data && now - cache.ts < CACHE_TTL_MS) {
    return { ...cache.data, cached: true };
  }

  const byId = {};
  try {
    // 主查询：一次取回 9 家门店
    const storesRaw = await queryUpstream({ pl: "true", "parts.0": PART, location: LOCATION });
    for (const s of storesRaw) {
      const item = normalizeStore(s, PART);
      if (TARGET_IDS.has(item.storeNumber)) byId[item.storeNumber] = item;
    }
    // 兜底：主查询若漏掉某家门店，逐店补查
    const missing = TARGET_STORES.filter(([id]) => !byId[id]);
    if (missing.length > 0) {
      const results = await Promise.allSettled(
        missing.map(([id, city]) =>
          queryUpstream({ pl: "true", "parts.0": PART, store: id }).then((arr) => ({ id, city, arr }))
        )
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.arr.length > 0) {
          const { id, city, arr } = r.value;
          byId[id] = normalizeStore(arr[0], PART, city);
        }
      }
    }
  } catch (e) {
    const msg = /HTTP (403|541)/.test(e.message)
      ? `苹果接口返回 ${e.message}（可能是机房 IP 被风控），稍后自动重试`
      : `查询失败：${e.message}，稍后自动重试`;
    return { ok: false, fetchedAt: Date.now(), stores: [], error: msg };
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
  };
  cache = { ts: Date.now(), data };
  return data;
}

export { TARGET_STORES, BUY_URL };
