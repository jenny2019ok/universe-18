# 31号宇宙临时开放日 · UNIVERSE 31

一场为 Ashley 生日制作的短篇互动网页游戏。访客入境后可自由探索星图；探索三处后解锁宇宙中心，点亮蛋糕蜡烛，再为寿星和自己各留一个愿望。适配手机和电脑。

**游玩地址：** https://jenny2019ok.github.io/universe-31/

GitHub Pages 版本是纯静态游戏。访问编号和愿望只记录在当前浏览器，不是全站实时访客统计。原版的 Cloudflare Worker / D1 后端源码也保留在此仓库。

## 本地开发

需要 Node.js 22.13 或更新版本。

```sh
npm ci
npx vite --config vite.pages.config.ts
```

构建 GitHub Pages 页面：

```sh
npx vite build --config vite.pages.config.ts
```

`pages-src/` 是独立的静态入口；`docs/` 是发布到 GitHub Pages 的产物。原版应用入口在 `app/`，其访客 API 在 `app/api/visit/`。
