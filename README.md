# TFG Recipe Viewer

TerraFirmaGreg Modern 配方静态浏览站：由 GitHub Actions 从 [Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern) 最新 release tag 导出 EMI bundle，经 [emi-bundle-optimize](https://github.com/jmecn/emi-bundle-optimize) 优化后，用 [emi-recipe-renderer](https://github.com/jmecn/emi-recipe-renderer) 在浏览器中展示。

本仓库**不包含** `site/bundles/` 数据；bundle 由 **Export EMI bundle** workflow 生成，经 Actions Cache（key = `emi-bundle-<bundle_id>`）供 **Deploy Pages** 复用。

## 本地开发（已有 bundle）

```bash
npm install   # 需要 npm 上已有 emi-bundle-optimize@0.3.0
npm run copy -- --id tfg-0.12.8 /path/to/optimized-bundle
npm start
```

本地优化导出目录：

```bash
npm run optimize -- --in /path/to/export-raw/emi --out /path/to/export-opt --force --prune-lang
```

## CI 前置

| 依赖 | 发布物 | CI 获取方式 |
|------|--------|-------------|
| [minecraft-web-export](https://github.com/jmecn/minecraft-web-export) | GitHub Release **jar** | 按 tag 下载（如 `v0.3.0` → `minecraft-web-export-0.3.0.jar`） |
| [emi-recipe-renderer](https://github.com/jmecn/emi-recipe-renderer) | **npm** 包（含预编译 `dist/`） | `npm install emi-recipe-renderer@0.4.1`，不编译 |
| [emi-bundle-optimize](https://github.com/jmecn/emi-bundle-optimize) | **npm** CLI 包 | `npm install emi-bundle-optimize@0.3.0`，`npx emi-bundle-optimize optimize …` |

`emi-recipe-renderer` 与 `emi-bundle-optimize` 在推送 `v*` tag 后由各自仓库的 release workflow 发布到 npm；Pages CI 只消费 npm 版本（见 `ci/build.env`）。

**顺序**：先发布 `emi-bundle-optimize` 与 `emi-recipe-renderer` 对应版本，再跑本仓库 CI。发布后可在本地执行 `npm install` 并提交更新后的 `package-lock.json`（可选，便于锁定传递依赖）。

## CI 流水线（两条 workflow）

### 1. Export EMI bundle（重，按需）

Modpack 导出 → optimize → 写入 `site/bundles/tfg-<tag>/` → **Cache save**（key: `emi-bundle-tfg-<tag>`，重跑覆盖）→ 上传 `export-meta` artifact → **自动触发 Deploy Pages**。

Actions → **Export EMI bundle** → Run workflow

### 2. Deploy Pages（轻，日常）

从 Cache **restore** bundle（按 bundle id）→ 更新 `site/index.html` renderer 版本、`bundles.json` → 校验 → 部署 `site/`。

触发方式：

- push 到 `main`/`master` 且改动 `site/**`、`ci/**`、`scripts/**` 等（见 workflow `paths`）
- Export 成功后 `workflow_run` 自动部署
- 手动 **Run workflow**（可指定 `bundle_id` 或 `modpack_tag`）

**只改前端、不重导数据**：改 `site/app.js` 等并 push，或手动跑 Deploy Pages；无需再跑 Export。

| 变更类型 | 需要跑的 workflow |
|---------|-------------------|
| 站点 UI / CSS / 站点脚本 | Deploy Pages |
| 升 CDN `emi-recipe-renderer`（`ci/build.env`） | Deploy Pages |
| modpack 更新 / MWE 导出逻辑 / 新配方数据 | Export EMI bundle（会连带 Deploy） |

## 路由

全部使用 query 参数（`?bundle=tfg-0.12.8&lang=zh_cn` 等），适合 GitHub Pages，无需 path 重写。

## 相关仓库

| 仓库 | 角色 |
|------|------|
| minecraft-web-export | Forge 运行时 EMI 导出 |
| emi-bundle-optimize | 离线 WebP / 语言裁剪 |
| emi-recipe-renderer | 浏览器渲染 |
| recipe-viewer | 本地多 bundle 对比（开发用） |
