# 03 · 前端架构

技术栈：**Nuxt 4 + Vue 3.5 + TypeScript + Tailwind CSS + shadcn-vue（Reka UI）+ Pinia**。

## 1. 目录结构（目标形态）

```
app/
  app.vue                     根布局：Header + <NuxtPage/> + Footer
  assets/css/main.css         Tailwind 入口 + shadcn 设计令牌（CSS 变量）
  components/
    layout/
      AppHeader.vue           标题 / 全局搜索 / 主题切换 / GitHub
      AppFooter.vue           数据来源、许可、数据版本
    chip/
      ChipSearch.vue          搜索框（⌘K 焦点、防抖、键盘上下选择）
      ChipSidebar.vue         系列→line→型号 列表 + 封装/die 分组
      ChipInfoCard.vue        flash/ram/IO/订货号
      PackageSwitcher.vue     同一 die 的其它封装（切换 = 换文件）
    pin/
      PackageDiagram.vue      SVG 容器：接收 layout 结果渲染引脚
      PinShape.vue            单个引脚矩形/球 + label（可点击、可悬停）
      PinDetailPanel.vue      引脚详情：类型、功能分组、AF、变体切换
      FunctionGroup.vue       按外设分组的功能列表
    common/                   shadcn-vue 组件（Button/Card/Input/Badge/Tabs/Separator/…）
  composables/
    useDataBase.ts            dataBase / dataTag 解析（runtimeConfig）
    useChipIndex.ts           索引加载 + 缓存 + 搜索/筛选
    useChipData.ts            单芯片数据加载 + 缓存 + 重试 + 错误态
    useSelectedPin.ts         当前选中引脚（跨面板共享）
    useVariant.ts             当前变体选择（base / PINREMAP / …）
    useTheme.ts               亮/暗主题（class 策略）
  utils/
    package-layout.ts         核心：packageKind → 引脚坐标（见 05）
    pin-types.ts              type → 颜色/中文名/图标
    functions.ts              功能分组、AF 格式化、系统外设过滤
  stores/
    chips.ts                  Pinia：索引、当前芯片、当前引脚（跨组件共享的少量状态）
  pages/
    index.vue                 首页（= 查询工作台，单页足够，见 §4）
    [...slug].vue             404
```

## 2. 状态管理边界

只有三类状态进 Pinia：

```ts
// stores/chips.ts
index        // 已加载的家族分片 + 搜索关键词
currentChip  // 当前芯片 slug + 数据
currentPin   // 当前选中的 position
variant      // 当前变体 key（null 表示基础引脚定义）
```

其余（悬停态、面板折叠、滚动位置）留在组件局部。**不要把派生数据存进 store**（例如"按外设分组的函数列表"用 `computed` 算）。

## 3. 数据访问层

```ts
// composables/useChipData.ts（示意）
const cache = new Map<string, ChipDoc>()

export function useChipData(chip: Ref<string | null>) {
  const data = ref<ChipDoc | null>(null)
  const error = ref<string | null>(null)
  const pending = ref(false)

  watch(chip, async (slug) => {
    if (!slug) return
    if (cache.has(slug)) { data.value = cache.get(slug)!; return }
    pending.value = true; error.value = null
    try {
      data.value = await fetchWithRetry(`${dataBase.value}/st/${family}/${slug}.json`)
      cache.set(slug, data.value!)
    } catch (e) { error.value = String(e) }   // 交给 UI 显示重试按钮
    finally { pending.value = false }
  })

  return { data, error, pending }
}
```

`dataBase` 的解析（同源 `/data` vs CDN）见 [02-data-contract](02-data-contract.md) §1。

要求：

- **所有网络请求走同一个 helper**（`app/utils/http.ts`）：超时 10 s、最多 3 次、指数退避、非 2xx 抛错、JSON 解析失败也算错。
- 失败必须可见：`error` 非空 → 面板显示错误态 + 重试按钮（不静默）。
- 家族分片按需加载；`index.json` 只在首屏拉一次。

## 4. 路由与页面结构

MVP 用**单页工作台**（`app/pages/index.vue`），三栏布局；URL 用 query 保存状态，便于分享：

```
/?chip=STM32F103C8Tx&pin=22&variant=PINREMAP
```

后续如果需要 SEO 页面，再扩展为：

```
/chips/STM32F103C8Tx        型号详情（可预渲染，SEO 价值高）
/families/STM32F1           系列页
```

`nuxt.config.ts` 里对应配置 `routeRules`（索引页预渲染、型号页 SWR）。

## 5. 性能

| 关注点 | 做法 |
|---|---|
| 首屏 | 只拉 `index.json`（1 KB）+ 首个分片；芯片数据在选中时才拉 |
| 引脚图渲染 | 纯计算 + `v-for`，`pinCount ≤ 200` 无需虚拟化；布局结果 `computed` 缓存 |
| 大芯片（BGA 436 球） | label 只渲染 pad 名（不渲染全部功能）；悬停才显示 tooltip |
| 主题切换 | CSS 变量切换 class，不触发重新请求 |
| 打包 | shadcn 组件是源码引入，按需 tree-shake；不引入完整 UI 库 |

## 6. 无障碍与键鼠

- 引脚图：每个引脚是 `<rect role="button" tabindex="0">`，支持 `Enter/Space` 选中、`←/→/↑/↓` 在相邻引脚间移动（按 position 顺序，不按坐标）。
- 搜索：`⌘K`/`Ctrl+K` 聚焦，`↑/↓` 选择，`Enter` 确认，`Esc` 清空。
- 颜色不作为唯一信息：引脚类型同时用边框样式 + tooltip 文本表达。

## 7. 代码规范

- ESLint（仓库已有 `@antfu/eslint-config`）保持零警告；提交前 `pnpm lint && pnpm typecheck`。
- 组件文件用 PascalCase；组合式函数 `useXxx` 放 `composables/`；纯函数放 `utils/`（便于单测）。
- 所有面向用户的文案先集中在一个常量文件里（`app/constants/strings.ts`），为中文/英文切换留好入口（MVP 只上中文）。
