// @ts-check
import antfu from '@antfu/eslint-config'
import nuxt from './.nuxt/eslint.config.mjs'

export default antfu(
  {
    formatters: true,
    pnpm: true,
    antislop: true,
    ignores: ['docs/**', 'dist/**', '.output/**', 'app/components/ui/**'],
  },
)
  .append(nuxt())
  .append({
    // pnpm-workspace.yaml 不再使用 catalogs（本仓库是单包仓库，catalogs 只带来风险：
    // `pnpm lint --fix` 会把 catalog 的值改写成 `catalog:<同名组>` 这种递归定义，pnpm 直接拒绝；
    // Cloudflare 构建也因此失败过一次）。版本现在直接写在 package.json / overrides 里。
    // 下面这些规则继续关着，防止以后有人手滑再引入 catalogs。
    files: ['pnpm-workspace.yaml'],
    rules: {
      'pnpm/yaml-blank-lines': 'off',
      'pnpm/yaml-no-duplicate-catalog-item': 'off',
      'pnpm/yaml-no-unused-catalog-item': 'off',
      'yaml/sort-keys': 'off',
    },
  })
  .append({
    // package.json 一侧也关掉 catalog 强制：本仓库不使用 catalogs，
    // 直接写语义化版本，避免 eslint 的 pnpm/json-enforce-catalog 把版本改回 `catalog:` 引用。
    files: ['package.json'],
    rules: {
      'pnpm/json-enforce-catalog': 'off',
    },
  })
