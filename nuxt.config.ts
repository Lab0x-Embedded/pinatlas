import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import { pwa } from './app/config/pwa'
import { appDescription, appName } from './app/constants/index'

// 数据来自 Lab0x-Embedded/pinatlas-data（见 docs/02-data-contract.md）。
//
// 默认走 jsDelivr 的 **fastly** 镜像；**运行时还能在页头切换**（见 app/constants/data-sources.ts：
// 5 个 jsDelivr 镜像 + 同源快照），因为镜像在不同运营商/地区快慢完全不同，用户自己切比我们赌一个准。
// 想完全离线/自托管：`pnpm data:pull` 把快照放进 public/data/，再设 NUXT_PUBLIC_DATA_LOCAL=true。
//
// 数据版本固定成**不可变 tag**，不用 main：jsDelivr 对分支引用有缓存，同一 URL 会拿到新旧两份
// 数据（docs/07 §9），曾导致线上 37 个 GPIO 脚渲染成黑块（docs/07 §17）。
// 数据仓库每次同步后打 `data-YYYY.MM.DD`（同一天第二次发布加 `.N` 后缀），要跟新数据就更新这里的
// tag，或用 NUXT_PUBLIC_DATA_TAG 覆盖。
const dataTag = process.env.NUXT_PUBLIC_DATA_TAG || 'data-2026.09.23.3'
const dataHost = process.env.NUXT_PUBLIC_DATA_CDN_HOST || 'fastly.jsdelivr.net'
// jsDelivr 上这份数据集的路径前缀（换 host 时只换前缀，其余拼法不变）
const dataPath = `/gh/Lab0x-Embedded/pinatlas-data@${dataTag}/data`
const dataLocal = process.env.NUXT_PUBLIC_DATA_LOCAL === 'true'
const dataBase = process.env.NUXT_PUBLIC_DATA_BASE
  || (dataLocal ? '/data' : `https://${dataHost}${dataPath}`)

export default defineNuxtConfig({
  modules: [
    '@vueuse/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@vite-pwa/nuxt',
    '@nuxt/eslint',
  ],

  // shadcn-vue 组件按文件名直接使用（<Button />、<CardHeader />），不叠加目录前缀；
  // 只扫描 .vue，避免同目录的 variants.ts / index.ts 被当成同名组件
  components: [
    { path: '~/components', pathPrefix: false, extensions: ['vue'] },
  ],

  devtools: {
    enabled: true,
  },

  app: {
    head: {
      title: appName,
      viewport: 'width=device-width,initial-scale=1',
      link: [
        // 图标都在 public/（由原始 logo 生成：透明底 PNG + 多尺寸 ico，见 docs/04 §1 品牌资源）
        { rel: 'icon', href: '/favicon.ico', sizes: 'any' },
        { rel: 'icon', href: '/logo.png', type: 'image/png', sizes: '512x512' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: appDescription },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', media: '(prefers-color-scheme: light)', content: 'white' },
        { name: 'theme-color', media: '(prefers-color-scheme: dark)', content: '#0a0a0a' },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    classSuffix: '',
  },

  runtimeConfig: {
    public: {
      dataBase,
      dataTag,
      dataHost,
      dataPath,
      dataLocal,
    },
  },

  future: {
    compatibilityVersion: 4,
  },

  experimental: {
    payloadExtraction: false,
    renderJsonPayloads: true,
    typedPages: true,
  },

  compatibilityDate: '2024-08-14',

  nitro: {
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    prerender: {
      crawlLinks: false,
      routes: ['/'],
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  eslint: {
    config: {
      standalone: false,
      nuxt: {
        sortConfigKeys: true,
      },
    },
  },

  pwa,
})
