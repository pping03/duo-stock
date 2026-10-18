# 部署指南 · iPhone Duo 库存监控（网页版）

架构：**静态页面 + 无服务器函数代理**（苹果接口只允许自家域名跨域，浏览器必须经服务端函数转发）。
部署为**独立项目**，不碰你现有网站/项目的任何文件；需要的话再用子域名（如 `duo.你的域名`）指向它。

```
iphone-duo-stock-deploy/
├── index.html              # 监控页面（3 秒自动刷新，含访问密钥保护）
├── api/stock.js            # Vercel Serverless Function  → GET /api/stock
├── functions/api/stock.js  # Cloudflare Pages Function   → GET /api/stock
├── lib/stock.js            # 共享查询逻辑（两家平台共用）
└── package.json
```

## 一、需要准备的 Token / API（核心清单）

| 服务 | 需要什么 | 在哪获取 | 必须？ |
|---|---|---|---|
| **Apple 库存接口** | 无需任何 key | 公开接口 | ✅ 免费无门槛 |
| **Cloudflare Pages**（推荐） | ① **API Token**（权限：Account → Cloudflare Pages → Edit）<br>② **Account ID** | dash.cloudflare.com → 我的个人资料 → API 令牌 → 创建令牌<br>Account ID 在 dash.cloudflare.com 首页右侧栏 | 二选一 |
| **Vercel**（备选） | **Vercel Token**（Scope 选你的账号）<br>若账号在团队里，再给 **Team ID/Slug** | vercel.com/account/tokens | 二选一 |
| **GitHub** | **Personal Access Token**（classic: `repo` 权限；或 fine-grained: Contents Read&Write） | github.com/settings/tokens | 仅当要我帮你推代码建仓库时需要；自己 `git push` 则不需要 |
| **Spaceship**（域名） | 域名 DNS 管理权限（面板即可，无需 API） | spaceship.com 控制台 | 可选：仅绑定自定义域名时 |

> 🔐 安全提示：请给**最小权限、短期有效**的 token，用完即吊销/轮换。我只会用它执行部署命令，不会写入交付文件或发往任何地方。

## 二、推荐方案：Cloudflare Pages（免费、独立、自带域名）

```bash
# 0. 安装 CLI（一次性）
npm i -g wrangler

# 1. 用你的 API Token 登录
export CLOUDFLARE_API_TOKEN=你的token        # Windows: set CLOUDFLARE_API_TOKEN=...
export CLOUDFLARE_ACCOUNT_ID=你的account_id

# 2. 直接部署（项目名任取，比如 duo-stock，与现有项目完全隔离）
npx wrangler pages deploy iphone-duo-stock-deploy --project-name=duo-stock

# 3. 完成 → 访问 https://duo-stock.pages.dev
```

设置访问密钥（强烈建议，只有你自己能看）：
```bash
npx wrangler pages secret put ACCESS_KEY --project-name=duo-stock
# 或在 dash.cloudflare.com → Workers 和 Pages → duo-stock → Settings → Environment variables 添加
```

## 三、备选方案：Vercel

```bash
# 0. 安装 CLI（一次性）
npm i -g vercel

# 1. 用你的 Vercel Token 登录
export VERCEL_TOKEN=你的token

# 2. 部署（新项目名 duo-stock，独立于你现有 Vercel 项目）
cd iphone-duo-stock-deploy && vercel --prod --yes --name duo-stock

# 3. 完成 → 访问 https://duo-stock.vercel.app
```
访问密钥：vercel.com → 项目 duo-stock → Settings → Environment Variables → 新增 `ACCESS_KEY`，之后重新部署一次生效。

## 四、GitHub 存代码（可选）

```bash
cd iphone-duo-stock-deploy
git init && git add . && git commit -m "iphone duo stock monitor"
git remote add origin https://github.com/你的用户名/duo-stock.git
git push -u origin main     # 用 PAT 或 SSH key
```
推上去之后，Cloudflare Pages / Vercel 都可以改成 **Git 集成自动部署**（连 GitHub 仓库，push 即发布）。

## 五、绑定自定义域名（用你的 Spaceship 域名，可选）

1. Cloudflare Pages 项目 → Custom domains → Add → 填 `duo.你的域名`
2. 到 Spaceship → 该域名 → DNS 管理，添加记录：
   - `CNAME` / 主机名 `duo` / 值 `duo-stock.pages.dev`
   - 若域名的 NS 已转到 Cloudflare，则直接在 Cloudflare DNS 里加这条 CNAME
3. 等 1–2 分钟生效，全程不改动你现有网站的任何配置。

## 六、验证

- 打开页面应显示 9 家门店卡片，每 3 秒自动刷新
- `curl "https://你的域名/api/stock?key=你的密钥"` 应返回 JSON
- 若页面提示"苹果接口返回 HTTP 403/541"：说明该平台机房 IP 被苹果风控（较少见），
  换另一个平台部署即可（Vercel ↔ Cloudflare 互为备选）；本机 `server.py` 版本永远是保底。

## 常用参数（在平台环境变量里配置）

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PART` | `MK2P4CH/A` | 物料号（512G 星光白；夜空色 512G = MK2Q4CH/A） |
| `LOCATION` | `100000` | 查询位置（北京邮编，一次返回京津 9 店） |
| `ACCESS_KEY` | 空（不校验） | 页面/API 访问密钥 |
