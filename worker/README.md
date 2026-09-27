# 18 号宇宙访客档案

网站继续托管在 GitHub Pages。这个 Cloudflare Worker 只接收访客昵称、浏览器随机编号和礼物，并写入 D1。访客无需登录；私人读取接口必须提交宇宙主人现有 Firebase 邮箱密码账号签发的 ID token。

## 当前部署

- Cloudflare D1：`universe-18-visitors`（数据库 ID `900788fa-3d6b-4be3-98a3-1222d9eb11a2`）
- Worker：`https://universe-18-visitors.jenny2019ok.workers.dev`
- Worker 环境变量：`SITE_ORIGIN`、`FIREBASE_PROJECT_ID`、`OWNER_EMAIL`
- GitHub Pages 使用 `VITE_VISITOR_API_URL` 指向该 Worker。

## 后续重新部署

1. 在 Cloudflare 账号登录 Wrangler：`npx wrangler login`。
2. 从项目根目录执行 `npx wrangler deploy --config worker/wrangler.jsonc`。
3. 若在全新数据库上部署，先运行 `npx wrangler d1 execute universe-18-visitors --remote --file=worker/schema.sql --config worker/wrangler.jsonc`。
4. 改动网页后重新构建并部署 GitHub Pages。

Cloudflare 控制台里创建并部署了最初版本；本地源码是与该版本对应的可维护版本。

## 计数口径

同一浏览器保留一个随机编号，重复进入不会增加人数；清除浏览器数据、更换设备或无痕窗口会被视为新访客。公开网页无法可靠识别自然人，也无法防止有意伪造访问，因此数字代表浏览器记录，不是精确独立人数。Worker 不保存 IP 地址或真实设备号。

新访客和 Firebase 历史记录在后台分开展示，不自动合并，因为原有记录和新编号无法可靠去重。D1 免费额度以 Cloudflare 当时公布的价格页为准。
