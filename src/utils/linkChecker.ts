import type { Bookmark } from '../bookmarks'

export interface LinkCheckItem {
  id: string
  title: string
  url: string
  category: string
  status?: number
  message: string
  isBroken: boolean
  isTimeout: boolean
  checkedAt: number
}

const HEAD_FALLBACK_STATUSES = new Set([400, 403, 405, 501])

async function fetchWithTimeout(
  url: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
  outerSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController()
  const onOuterAbort = () => controller.abort()
  if (outerSignal?.aborted) {
    controller.abort()
  } else {
    outerSignal?.addEventListener('abort', onOuterAbort, { once: true })
  }

  const timerId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      method,
      signal: controller.signal,
      redirect: 'follow',
    })
  } finally {
    clearTimeout(timerId)
    outerSignal?.removeEventListener('abort', onOuterAbort)
  }
}

export async function checkSingleUrl(
  url: string,
  timeoutMs = 6000,
  outerSignal?: AbortSignal
): Promise<{ status?: number; message: string; isBroken: boolean; isTimeout: boolean }> {
  try {
    let response: Response
    try {
      response = await fetchWithTimeout(url, 'HEAD', timeoutMs, outerSignal)
      if (HEAD_FALLBACK_STATUSES.has(response.status)) {
        response = await fetchWithTimeout(url, 'GET', timeoutMs, outerSignal)
      }
    } catch (innerError) {
      if (outerSignal?.aborted) throw innerError
      response = await fetchWithTimeout(url, 'GET', timeoutMs, outerSignal)
    }

    const isSuccess = response.status >= 200 && response.status < 400
    return {
      status: response.status,
      message: isSuccess ? '正常' : `HTTP ${response.status} ${response.statusText || ''}`.trim(),
      isBroken: !isSuccess,
      isTimeout: false,
    }
  } catch (error) {
    if (outerSignal?.aborted) {
      return { message: '已取消', isBroken: false, isTimeout: false }
    }
    const isTimeout = error instanceof DOMException && error.name === 'AbortError'
    return {
      message: isTimeout ? '请求超时' : (error instanceof Error ? error.message : '连接失败'),
      isBroken: true,
      isTimeout,
    }
  }
}

export async function checkBookmarkList(
  bookmarks: Bookmark[],
  concurrency = 6,
  onProgress?: (item: LinkCheckItem, index: number, total: number) => void,
  abortSignal?: AbortSignal
): Promise<LinkCheckItem[]> {
  const results: LinkCheckItem[] = []
  let currentIndex = 0
  const total = bookmarks.length

  const worker = async () => {
    while (currentIndex < total) {
      if (abortSignal?.aborted) break
      const index = currentIndex++
      const bookmark = bookmarks[index]
      if (!bookmark) continue

      let checkResult: { status?: number; message: string; isBroken: boolean; isTimeout: boolean } = {
        status: undefined,
        message: '未检测',
        isBroken: false,
        isTimeout: false,
      }
      try {
        checkResult = await checkSingleUrl(bookmark.url, 6000, abortSignal)
      } catch (error) {
        checkResult = {
          status: undefined,
          message: error instanceof Error ? error.message : '检测异常',
          isBroken: true,
          isTimeout: false,
        }
      }

      if (abortSignal?.aborted) break

      const item: LinkCheckItem = {
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        category: bookmark.category,
        status: checkResult.status,
        message: checkResult.message,
        isBroken: checkResult.isBroken,
        isTimeout: checkResult.isTimeout,
        checkedAt: Date.now(),
      }

      results.push(item)
      if (onProgress) {
        onProgress(item, results.length, total)
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker())
  try {
    await Promise.all(workers)
  } catch {
    // 忽略工作线程异常
  }

  return results
}
