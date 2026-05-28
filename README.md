# TFG Recipe Viewer

TerraFirmaGreg Modern 配方静态浏览站：由 GitHub Actions 从 [Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern) 最新 release tag 导出 EMI bundle，经 [emi-bundle-optimize](https://github.com/jmecn/emi-bundle-optimize) 优化后，用 [emi-recipe-renderer](https://github.com/jmecn/emi-recipe-renderer) 在浏览器中展示。

本仓库**不包含** `site/bundles/` 数据；制品由 CI 生成并部署到 GitHub Pages。

## 本地开发（已有 bundle）

```bash
npm install
npm run copy -- --id tfg-0.12.8-opt /path/to/optimized-bundle
npm start
```

## CI 前置

| 依赖 | 发布物 | CI 获取方式 |
|------|--------|-------------|
| [minecraft-web-export](https://github.com/jmecn/minecraft-web-export) | GitHub Release **jar** | 按 tag 下载（如 `v0.2.0` → `minecraft-web-export-0.2.0.jar`） |
| [emi-recipe-renderer](https://github.com/jmecn/emi-recipe-renderer) | **npm** 包（含预编译 `dist/`） | `npm install emi-recipe-renderer@0.2.1`，不编译 |
| [emi-bundle-optimize](https://github.com/jmecn/emi-bundle-optimize) | 源码（**无 tag**） | checkout `master`（或 commit SHA），`npm ci` 后跑 CLI |

`emi-recipe-renderer` 在仓库发 GitHub Release 时会同步发布到 npm（见该仓库 `npm-publish` workflow）；Pages CI 只消费 npm 上的构建产物。

## CI 流水线

见 [.github/workflows/build-pages.yml](.github/workflows/build-pages.yml)。概要：

1. Modpack-Modern 最新 semver tag → `pakku fetch`
2. GitHub Release jar → HeadlessMC + xvfb 全量 EMI 导出
3. checkout `emi-bundle-optimize@master` 优化 → `site/bundles/tfg-<tag>-opt/`
4. npm 上的 `emi-recipe-renderer` 同步到 `site/lib/`，部署 `site/` 到 GitHub Pages

### 手动触发

Actions → **Build and deploy Pages** → **Run workflow**

## 路由

全部使用 query 参数（`?bundle=tfg-0.12.8-opt&lang=zh_cn` 等），适合 GitHub Pages，无需 path 重写。

## 相关仓库

| 仓库 | 角色 |
|------|------|
| minecraft-web-export | Forge 运行时 EMI 导出 |
| emi-bundle-optimize | 离线 WebP / 语言裁剪 |
| emi-recipe-renderer | 浏览器渲染 |
| recipe-viewer | 本地多 bundle 对比（开发用） |
