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
    // pnpm-workspace.yaml 的自动修复不可用：`pnpm lint --fix` 会把 catalogs 里的版本号
    // 改写成 `catalog:<同名组>`，那是递归定义，pnpm 会直接拒绝（ERR_PNPM_CATALOG_ENTRY_INVALID_RECURSIVE_DEFINITION）。
    // 已验证过一次（工作区文件被改坏 → pnpm install 直接失败），因此这里关掉这几个规则在
    // pnpm-workspace.yaml 上的检查，只在 package.json 一侧保留 catalog 约定。
    files: ['pnpm-workspace.yaml'],
    rules: {
      'pnpm/yaml-blank-lines': 'off',
      'pnpm/yaml-no-duplicate-catalog-item': 'off',
      'pnpm/yaml-no-unused-catalog-item': 'off',
      'yaml/sort-keys': 'off',
    },
  })
  .append({
    // package.json 一侧也关掉 catalog 强制：
    // `pnpm install` 在重新解析依赖时会把 `catalog:build` 写回字面版本（本仓库实测），
    // 而 eslint 要求写 catalog → 两个工具互相打架。以 pnpm install 为准（装不上比风格问题严重），
    // 版本仍集中在 pnpm-workspace.yaml 的 catalogs 里维护。
    files: ['package.json'],
    rules: {
      'pnpm/json-enforce-catalog': 'off',
    },
  })
