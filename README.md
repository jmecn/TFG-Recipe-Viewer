# TFG Recipe Viewer

TerraFirmaGreg Modern 配方静态浏览站：由 GitHub Actions 从 [Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern) 最新 release tag 导出 EMI bundle，经 [emi-bundle-optimize](https://github.com/jmecn/emi-bundle-optimize) 优化后，用 [emi-recipe-renderer](https://github.com/jmecn/emi-recipe-renderer) 在浏览器中展示。

本仓库**不包含** `site/bundles/` 数据。CI 用两条 workflow 分工：

| Cache key | 内容 | 由谁写入 |
|-----------|------|----------|
| `emi-raw-tfg-<tag>` | MC 导出的原始 `export-raw/emi` | **Export EMI bundle** |
| （无单独 optimized cache） | optimize 在 Deploy 时从 raw 现算 | **Deploy Pages** |

## 本地开发（已有 bundle）

```bash
npm install
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
| [minecraft-web-export](https://github.com/jmecn/minecraft-web-export) | GitHub Release **jar** | 按 tag 下载 |
| [emi-recipe-renderer](https://github.com/jmecn/emi-recipe-renderer) | **npm** 包 | Deploy 时安装 |
| [emi-bundle-optimize](https://github.com/jmecn/emi-bundle-optimize) | **npm** CLI | **Deploy** 时 optimize |

版本钉在 `ci/build.env`。先发布 npm 包，再跑本仓库 CI。

## CI 流水线

### 1. Export EMI bundle（重，几小时）

Modpack → HeadlessMC 全量 EMI 导出 → 校验 → **Cache save** `emi-raw-<bundle_id>` → 上传 **Artifacts**（`export-meta` + `emi-raw-<bundle_id>.tar.gz` 可下载分析）→ 自动触发 Deploy。

Actions → **Export EMI bundle** → Run workflow

**不做 optimize**（避免与 optimize 工具版本绑死；重跑 export 更贵）。

### 2. Deploy Pages（中轻，常跑）

从 Cache **restore** 原始 bundle → **optimize**（WebP、lang prune，通常比 export 快得多）→ 写入 `site/bundles/` → patch renderer → 部署 `site/`。

触发：

- Export 成功后 `workflow_run`
- push `site/**`、`ci/**`、`scripts/**` 等（见 workflow `paths`）
- 手动 Run workflow（可指定 `optimize_version` / `renderer_version`）

| 变更类型 | 需要跑的 workflow |
|---------|-------------------|
| 只改 `site/app.js`、CSS | **Deploy Pages**（复用 raw cache，会重跑 optimize） |
| 只升 `OPTIMIZE_VERSION` / prune 规则 | **Deploy Pages**（不必重导 MC） |
| 只升 `RENDERER_VERSION` | **Deploy Pages** |
| modpack / MWE 导出 / 新配方数据 | **Export EMI bundle**（再 Deploy） |

**注意**：Deploy 依赖 `emi-raw-<bundle_id>` cache。若 cache 过期或被 evict，需先再跑 Export。

## 路由

全部使用 query 参数（`?bundle=tfg-0.12.8&lang=zh_cn` 等），适合 GitHub Pages。

## 相关仓库

| 仓库 | 角色 |
|------|------|
| minecraft-web-export | Forge 运行时 EMI 导出 |
| emi-bundle-optimize | 离线 WebP / 语言裁剪 |
| emi-recipe-renderer | 浏览器渲染 |
