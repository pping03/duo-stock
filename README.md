# duo-stock · iPhone Duo 512GB 星光白 库存监控

天津 3 家 + 北京 6 家 Apple Store 取货库存，3 秒自动刷新，有货报警。
部署目标：https://duo.999095.xyz

- `index.html` 监控页面（含 ACCESS_KEY 访问保护）
- `api/stock.js` Vercel Function
- `functions/api/stock.js` Cloudflare Pages Function
- `lib/stock.js` 共享查询逻辑（苹果官方取货接口）

部署方式见 `README-DEPLOY.md`。
