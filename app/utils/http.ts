/**
 * 统一网络层：超时、重试、JSON 校验。
 *
 * 上游 CDN 在并发下实测有约 24% 的静默失败率（见 docs/07-development-problems.md §2），
 * 所以这里把"空响应 / 非 2xx / 解析失败"一律当失败，并退避重试；最终失败要抛出去让 UI 显示，
 * 绝不能安静地留白。
 */

export interface FetchOptions {
  /** 总尝试次数（含首次） */
  tries?: number
  timeoutMs?: number
  /** 退避基数（毫秒） */
  backoffMs?: number
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { tries = 3, timeoutMs = 10000, backoffMs = 400 } = options
  let lastError: unknown

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const text = await response.text()
      if (!text.trim()) {
        throw new Error('响应为空')
      }
      return JSON.parse(text) as T
    }
    catch (error) {
      lastError = error
      if (attempt < tries) {
        await new Promise(resolve => setTimeout(resolve, backoffMs * 2 ** (attempt - 1)))
      }
    }
  }

  throw new Error(`请求失败：${url}（${(lastError as Error)?.message ?? lastError}）`)
}
