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

export async function checkSingleUrl(url: string, timeoutMs = 6000): Promise<{ status?: number; message: string; isBroken: boolean; isTimeout: boolean }> {
  const controller = new AbortController()
  const timerId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let response: Response
    try {
      response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      })
      if (response.status === 405 || response.status === 400) {
        response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          redirect: 'follow',
        })
      }
    } catch (innerError) {
      if (controller.signal.aborted) {
        return { message: '请求超时', isBroken: true, isTimeout: true }
      }
      response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
      })
    }

    clearTimeout(timerId)
    const isSuccess = response.status >= 200 && response.status < 400
    return {
      status: response.status,
      message: isSuccess ? '正常' : `HTTP ${response.status} ${response.statusText || ''}`.trim(),
      isBroken: !isSuccess,
      isTimeout: false,
    }
  } catch (error) {
    clearTimeout(timerId)
    const isAborted = controller.signal.aborted
    return {
      message: isAborted ? '请求超时' : (error instanceof Error ? error.message : '连接失败'),
      isBroken: true,
      isTimeout: isAborted,
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
        checkResult = await checkSingleUrl(bookmark.url)
      } catch (error) {
        checkResult = {
          status: undefined,
          message: error instanceof Error ? error.message : '检测异常',
          isBroken: true,
          isTimeout: false,
        }
      }

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
