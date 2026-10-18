/**
 * 共享库存查询模块 —— 同时供 Vercel Function 与 Cloudflare Pages Function 使用
 * 数据源: https://www.apple.com.cn/shop/retail/pickup-message （官网"查看供货情况"同源接口）
 *
 * 验证记录（2026-10-18）:
 * - 接口可用：HTTP 200，返回 JSON；pickup-message 不像 fulfillment-messages 那样屏蔽非中国区 IP
 * - 查询 ?pl=true&parts.0=MK2P4CH/A&location=100000 一次返回北京 6 家 + 天津 3 家共 9 家门店
 * - 9 个门店编号逐一验证通过（见 TARGET_STORES）
 * - 多型号查询已验证：parts.0..N 可一次查询多个型号，返回 body.stores[].partsAvailability[PART]
 * - 返回结构: body.stores[].{storeNumber, storeName, city, partsAvailability[PART].pickupDisplay}
 *   pickupDisplay === "available" 表示有货可取
 *
 * 监控型号（2026-10-18 官网 JSON 确认，含 256GB）:
 * - iPhone Duo 512GB/256GB 星光白色/夜空黑色 MK2P4CH/A, MK2M4CH/A, MK2Q4CH/A, MK2N4CH/A
 * - iPhone 18 Pro 512GB/256GB 黑/银/酒红/冰川蓝
 * - iPhone 18 Pro Max 512GB/256GB 黑/银/酒红/冰川蓝
 */

const MODELS = [
  { part: "MK2P4CH/A", name: "iPhone Duo 512GB 星光白色", price: 17999 },
  { part: "MK2M4CH/A", name: "iPhone Duo 256GB 星光白色", price: 15999 },
  { part: "MK2Q4CH/A", name: "iPhone Duo 512GB 夜空黑色", price: 17999 },
  { part: "MK2N4CH/A", name: "iPhone Duo 256GB 夜空黑色", price: 15999 },
  { part: "MJTC4CH/A", name: "iPhone 18 Pro 512GB 黑色", price: 11999 },
  { part: "MJTD4CH/A", name: "iPhone 18 Pro 512GB 银色", price: 11999 },
  { part: "MJTE4CH/A", name: "iPhone 18 Pro 512GB 酒红色", price: 11999 },
  { part: "MJTF4CH/A", name: "iPhone 18 Pro 512GB 冰川蓝色", price: 11999 },
  { part: "MJT74CH/A", name: "iPhone 18 Pro 256GB 黑色", price: 9999 },
  { part: "MJT84CH/A", name: "iPhone 18 Pro 256GB 银色", price: 9999 },
  { part: "MJT94CH/A", name: "iPhone 18 Pro 256GB 酒红色", price: 9999 },
  { part: "MJTA4CH/A", name: "iPhone 18 Pro 256GB 冰川蓝色", price: 9999 },
  { part: "MJYA4CH/A", name: "iPhone 18 Pro Max 512GB 黑色", price: 12999 },
  { part: "MJYC4CH/A", name: "iPhone 18 Pro Max 512GB 银色", price: 12999 },
  { part: "MJYD4CH/A", name: "iPhone 18 Pro Max 512GB 酒红色", price: 12999 },
  { part: "MJYE4CH/A", name: "iPhone 18 Pro Max 512GB 冰川蓝色", price: 12999 },
  { part: "MJY64CH/A", name: "iPhone 18 Pro Max 256GB 黑色", price: 10999 },
  { part: "MJY74CH/A", name: "iPhone 18 Pro Max 256GB 银色", price: 10999 },
  { part: "MJY84CH/A", name: "iPhone 18 Pro Max 256GB 酒红色", price: 10999 },
  { part: "MJY94CH/A", name: "iPhone 18 Pro Max 256GB 冰川蓝色", price: 10999 },
];

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

let cache = { ts: 0, key: "", data: null };

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

function buildModelResult(model, storesById) {
  const stores = TARGET_STORES.map(([id, city]) => storesById[id] || {
    storeNumber: id, storeName: id, city, available: false,
    pickupDisplay: "unknown", quote: "接口未返回该门店", reservationUrl: BUY_URL,
  });
  return {
    part: model.part,
    name: model.name,
    price: model.price,
    anyAvailable: stores.some((s) => s.available),
    stores,
  };
}

export async function fetchStock(env = {}, { force = false, models: modelsOverride = null } = {}) {
  const LOCATION = env.LOCATION || "100000";
  // 型号列表优先级：调用方传入 > 环境变量 MODELS_JSON > 默认 MODELS
  // MODELS_JSON 格式: [{"part":"...","name":"...","price":...}]
  let models = modelsOverride || MODELS;
  if (!modelsOverride && env.MODELS_JSON) {
    try {
      const custom = JSON.parse(env.MODELS_JSON);
      if (Array.isArray(custom) && custom.length > 0 && custom.every((m) => m.part)) {
        models = custom;
      }
    } catch { /* 忽略非法 JSON，使用默认列表 */ }
  }

  const now = Date.now();
  const cacheKey = models.map((m) => m.part).join(",");
  if (!force && cache.data && cache.key === cacheKey && now - cache.ts < CACHE_TTL_MS) {
    return { ...cache.data, cached: true };
  }

  // 每个型号按门店编号索引的查询结果
  const perModelStores = models.map(() => ({}));
  try {
    // 主查询：一次取回全部型号 × 9 家门店
    const params = { pl: "true", location: LOCATION };
    models.forEach((m, i) => { params[`parts.${i}`] = m.part; });
    const storesRaw = await queryUpstream(params);
    models.forEach((m, i) => {
      for (const s of storesRaw) {
        const item = normalizeStore(s, m.part);
        if (TARGET_IDS.has(item.storeNumber)) perModelStores[i][item.storeNumber] = item;
      }
    });
    // 兜底：主查询若漏掉某家门店，逐店补查（带全部型号）
    const missingIds = TARGET_STORES.map(([id]) => id).filter((id) =>
      perModelStores.some((byId) => !byId[id])
    );
    if (missingIds.length > 0) {
      const results = await Promise.allSettled(
        missingIds.map((id) => {
          const p = { pl: "true", store: id };
          models.forEach((m, i) => { p[`parts.${i}`] = m.part; });
          return queryUpstream(p).then((arr) => ({ id, arr }));
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value.arr.length > 0) {
          const { id, arr } = r.value;
          const city = (TARGET_STORES.find(([sid]) => sid === id) || [])[1] || "";
          models.forEach((m, i) => {
            if (!perModelStores[i][id]) {
              perModelStores[i][id] = normalizeStore(arr[0], m.part, city);
            }
          });
        }
      }
    }
  } catch (e) {
    const msg = /HTTP (403|541)/.test(e.message)
      ? `苹果接口返回 ${e.message}（可能是机房 IP 被风控），稍后自动重试`
      : `查询失败：${e.message}，稍后自动重试`;
    return { ok: false, fetchedAt: Date.now(), models: [], error: msg };
  }

  const modelResults = models.map((m, i) => buildModelResult(m, perModelStores[i]));

  const data = {
    ok: true,
    fetchedAt: Date.now(),
    buyUrl: BUY_URL,
    location: LOCATION,
    // 新格式：全部型号
    models: modelResults,
    anyModelAvailable: modelResults.some((m) => m.anyAvailable),
    // 兼容旧格式：默认型号（第一个，即 iPhone Duo）—— 老前端继续可用
    part: modelResults[0].part,
    product: modelResults[0].name,
    price: modelResults[0].price,
    anyAvailable: modelResults[0].anyAvailable,
    stores: modelResults[0].stores,
  };
  cache = { ts: Date.now(), key: cacheKey, data };
  return data;
}

/**
 * 简洁格式：每个型号只列出有货/无货门店名，方便一眼查看
 * {
 *   ok: true, fetchedAt: 123,
 *   models: [{ name, price, inStock: ["三里屯"], outOfStock: ["天津大悦城", ...] }]
 * }
 */
export function toBrief(data) {
  if (!data.ok) return { ok: false, fetchedAt: data.fetchedAt, error: data.error };
  return {
    ok: true,
    fetchedAt: data.fetchedAt,
    anyAvailable: data.anyModelAvailable,
    models: (data.models || []).map((m) => ({
      name: m.name,
      price: m.price,
      inStock: m.stores.filter((s) => s.available).map((s) => s.storeName),
      outOfStock: m.stores.filter((s) => !s.available).map((s) => s.storeName),
    })),
  };
}

export { MODELS, TARGET_STORES, BUY_URL };

// 仅 iPhone Duo 的型号子集（供 /api/duo 使用）
export const DUO_MODELS = MODELS.filter((m) => m.name.includes("Duo"));
