# 09 · 部署到 Cloudflare Pages

本文只写**本机实测过**的配置。数据是客户端异步拉取的（`app/pages/index.vue` 里 `onMounted(bootstrap)`），
所以构建期不需要访问 CDN，Pages/Workers 这类静态+边缘运行时都适用。

## 1. 推荐配置（Pages + Git 集成）

| 项 | 值 | 依据 |
|---|---|---|
| 构建命令 | `pnpm build` | 本机实测通过 |
| 构建输出目录 | **`dist`** | `NITRO_PRESET=cloudflare_pages pnpm build` 实测产物在 `dist/`（不是 `.output/public`） |
| 环境变量 | `NITRO_PRESET=cloudflare_pages` | 不设这个，`pnpm build` 产物是 Node 服务（`.output/server`），Pages 跑不起来 |
| 环境变量 | `PNPM_VERSION=10.22.0` | 与 `package.json` 的 `packageManager` 一致，避免构建机用别的 pnpm 解析 `catalogs` |
| 环境变量（可选） | `NUXT_PUBLIC_DATA_TAG=data-2026.09.23` | 固定数据版本，避免分支缓存漂移；不设则用 `main` |
| 环境变量（可选） | `NUXT_PUBLIC_DATA_CDN_HOST=fastly.jsdelivr.net` | 默认已是 fastly |

产物结构（实测）：`dist/index.html`、`dist/_nuxt/`、`dist/_worker.js/`、`dist/_routes.json`、`dist/_headers`、PWA 图标。

本地预览：

```bash
NITRO_PRESET=cloudflare_pages pnpm build
npx wrangler pages dev dist        # 或 npx wrangler pages deploy dist
```

## 2. Workers（wrangler 直发）备选

```bash
NITRO_PRESET=cloudflare_module pnpm build
npx wrangler deploy
```

这条路径需要在仓库根放 `wrangler.jsonc`（`main` 指向 `.output/server/index.mjs`）。用 Pages Git 集成时**不要**加，
免得两套配置互相干扰。

## 3. 排查：`ERR_PNPM_CATALOG_ENTRY_INVALID_RECURSIVE_DEFINITION`

```
Found invalid catalog entry using the catalog protocol recursively.
The entry for '@antfu/eslint-config' in catalog 'dev' is invalid.
```

**根因**：`pnpm-workspace.yaml` 的 `catalogs` 里出现了指向自身 catalog 的条目，例如

```yaml
catalogs:
  dev:
    '@antfu/eslint-config': catalog:dev   # ← 递归，pnpm 直接报错
```

这种写法是 `pnpm lint --fix` 写坏的（`eslint-plugin-pnpm` 的 `yaml-*` 规则会"帮忙"改成 catalog 引用）。
仓库里已经处理：`eslint.config.js` 对 `pnpm-workspace.yaml` 关掉了带 `--fix` 的 yaml 规则（见 docs/07 §11）。

**历史**：坏值只存在于**初始提交 `9fd50a7`**，`4005b9a` 已修复（`git log -S "catalog:dev" -- pnpm-workspace.yaml` 可查）。
所以**如果构建时报这个错，说明构建跑的是 9fd50a7 那个旧提交**，而不是当前 main：

1. 在 Cloudflare 项目里确认 Production branch = `main`，且部署的是最新提交（Pages → Deployments 里看 commit hash）；
2. 重新触发一次部署（Retry deployment / 空提交 push），或先清掉构建缓存（Settings → Build cache → Clear）；
3. 复核远端文件：

   ```bash
   curl -s https://raw.githubusercontent.com/Lab0x-Embedded/pinatlas/main/pnpm-workspace.yaml | grep -A3 '^  dev:'
   # 期望：'@antfu/eslint-config': ^9.5.1（不能是 catalog:dev）
   ```

**预防**：不要对 `pnpm-workspace.yaml` 跑 `pnpm lint --fix`；改版本号手工改 `catalogs`。
