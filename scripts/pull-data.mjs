#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { access, cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve as pathResolve } from 'node:path'
// 拉取已发布的数据集快照到 public/data/（同源 /data/... 提供给前端）。
//
// 为什么是"下载 tarball"而不是逐文件拉：数据仓库有 2800+ 个小文件，逐文件请求在弱网下
// 既慢又容易失败（实测并行抓取静默失败率约 24%）。tarball 一次下载、一次解包，只有 data/
// 会被解出来。
//
// 用法：
//   pnpm data:pull                 # 默认 main 分支
//   DATA_REF=<tag 或 sha> pnpm data:pull
//   HTTPS_PROXY=http://127.0.0.1:7899 pnpm data:pull   # 需要代理的环境
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), '..')
const REF = process.env.DATA_REF || 'main'
const REPO = process.env.DATA_REPO || 'Lab0x-Embedded/pinatlas-data'
const TARGET = pathResolve(ROOT, 'public/data')
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || ''

const url = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/${REF}`
const urlForSha = `https://codeload.github.com/${REPO}/tar.gz/${REF}`
const archive = join(await mkdtemp(join(tmpdir(), 'pinatlas-data-')), 'data.tar.gz')

console.log(`拉取 ${REPO}@${REF} → ${TARGET}`)
if (PROXY) {
  console.log(`  使用代理 ${PROXY}`)
}

async function download(source) {
  // -f：HTTP 4xx/5xx 要当失败退出，否则 codeload 的 404 页面会被当成 tar 包解出
  // "Unrecognized archive format"，而 `refs/heads/<tag>` 这条路径对 tag 必然 404 →
  // catch 里的 sha/tag 重试永远走不到（实测 data:pull 拉 tag 直接失败）。
  const args = ['-sSLf', '--max-time', '600', '-o', archive]
  if (PROXY) {
    args.push('-x', PROXY)
  }
  args.push(source)
  await run('curl', args, { maxBuffer: 32 * 1024 * 1024 })
}

try {
  await download(url)
}
catch {
  // tag / sha 形式的 ref 走另一个路径（codeload 的 tar.gz/<ref> 接受 tag 与 commit）
  console.log(`  ${REF} 不是分支名，按 tag / commit 重试`)
  await download(urlForSha)
}

const tmp = dirname(archive)
await run('tar', ['-xzf', archive, '-C', tmp])

const { stdout } = await run('sh', ['-c', `ls -d ${tmp}/*/data`])
const extracted = stdout.trim().split('\n')[0]
if (!extracted) {
  console.error('解包里没有 data/ 目录')
  process.exit(1)
}

await rm(TARGET, { recursive: true, force: true })
await mkdir(dirname(TARGET), { recursive: true })
await cp(extracted, TARGET, { recursive: true })

const { stdout: countOut } = await run('sh', ['-c', `find ${TARGET} -name '*.json' | wc -l`])
const { stdout: sizeOut } = await run('sh', ['-c', `du -sh ${TARGET} | cut -f1`])
console.log(`完成：${countOut.trim()} 个 JSON，${sizeOut.trim()}`)
console.log(`提示：public/data 已在 .gitignore 中，部署前记得先跑一次 data:pull（或把 NUXT_PUBLIC_DATA_BASE 指向 CDN）。`)

try {
  await access(join(TARGET, 'index.json'))
}
catch {
  console.error('警告：没有 index.json，前端会报数据加载失败')
  process.exit(1)
}

await rm(tmp, { recursive: true, force: true })
