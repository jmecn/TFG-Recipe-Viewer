# TFG Recipe Viewer

TerraFirmaGreg Modern 配方浏览站流水线：从 [Modpack-Modern](https://github.com/TerraFirmaGreg-Team/Modpack-Modern) 导出 EMI bundle，用 [emi-bundle-optimize](https://github.com/jmecn/emi-bundle-optimize) 优化，在 [TFG-Recipe-Viewer-React](https://github.com/jmecn/TFG-Recipe-Viewer-React) 发布的静态前端上展示。

- **前端**：Deploy 时从 React 仓库 **最新 semver Release** 拉取（版本钉在 `ci/build.env`）。
- **旧版静态站**：已迁至同级目录 [TFG-Recipe-Viewer-Vanilla](../TFG-Recipe-Viewer-Vanilla/) 备份；本仓库 `site/` 仅保留 `bundles/` 占位，由 CI 填充。

## 本地开发

```bash
npm install
npm run fetch-site
npm run copy -- --id tfg-0.12.8 /path/to/optimized-bundle
npm start
```

查看将解析到的 Release 版本：

```bash
bash scripts/ci.sh load-config && bash scripts/ci.sh print-versions
```

## CI 版本策略

`ci/build.env` 只保留 **MC/Forge/Node** 等运行时常量。下列组件在 workflow 里执行 `print-versions` 时，若对应 `*_VERSION` 为空，则通过 `scripts/ci/lib/github-release.sh` 取 GitHub **最新 semver tag**：

| 组件 | 仓库 |
|------|------|
| Modpack-Modern | `MODPACK_REPO` |
| minecraft-web-export | `MWE_REPO` |
| TFG-Recipe-Viewer-React | `SITE_VIEWER_REPO` |
| emi-recipe-renderer | `RENDERER_REPO` |
| emi-bundle-optimize | `OPTIMIZE_REPO` |
| HeadlessMC | `HMC_REPO` |

日志中会打印 `::group::CI resolved versions` 块，并写入 Job Summary 表格。需要回滚时在 `build.env` 填 `*_VERSION`；手动 Run 时只需填 **Modpack 版本**（留空=最新）。

## 流水线

### Export EMI bundle

Modpack → HeadlessMC 导出 → 上传 `emi-raw-<bundle_id>` artifact → 触发 Deploy。

### Deploy Pages

`print-versions` → 拉 React 站点包 → optimize bundle → 部署 `site/`。

| 变更 | Workflow |
|------|----------|
| 新 modpack / 配方数据 | Export → Deploy |
| 仅前端 / npm 工具升级 | Deploy（自动跟最新 Release） |

## 相关仓库

| 仓库 | 角色 |
|------|------|
| TFG-Recipe-Viewer-React | 前端 Release |
| TFG-Recipe-Viewer-Vanilla | 旧静态站备份 |
| minecraft-web-export | EMI 导出 |
| emi-bundle-optimize | 离线优化 |
| emi-recipe-renderer | 浏览器渲染 |
