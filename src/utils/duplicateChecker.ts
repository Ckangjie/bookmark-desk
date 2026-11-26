export interface ChromeBookmarkItem {
  id: string
  title: string
  url: string
  folderPath: string
  parentId?: string
  dateAdded: number
}

export interface DuplicateGroup {
  url: string
  normalizedUrl: string
  items: ChromeBookmarkItem[]
}

export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim())
    parsed.hash = ''
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'spm', 'from']
    for (const param of trackingParams) {
      parsed.searchParams.delete(param)
    }
    parsed.searchParams.sort()
    let result = parsed.href
    if (result.endsWith('/') && parsed.pathname === '/') {
      result = result.slice(0, -1)
    }
    return result
  } catch {
    return rawUrl.trim()
  }
}

export async function scanDuplicateBookmarks(): Promise<DuplicateGroup[]> {
  if (typeof chrome === 'undefined' || !chrome.bookmarks) return []
  let tree: chrome.bookmarks.BookmarkTreeNode[] = []
  try {
    tree = await chrome.bookmarks.getTree()
  } catch {
    return []
  }

  const items: ChromeBookmarkItem[] = []
  const pending: { node: chrome.bookmarks.BookmarkTreeNode; path: string[] }[] = tree.map(node => ({
    node,
    path: [],
  }))

  while (pending.length) {
    const current = pending.pop()
    if (!current) continue
    const { node, path } = current

    if (node.url) {
      items.push({
        id: node.id,
        title: node.title?.trim() || node.url,
        url: node.url,
        folderPath: path.join(' / ') || '根目录',
        parentId: node.parentId,
        dateAdded: node.dateAdded ?? Date.now(),
      })
    } else {
      const folderTitle = node.title?.trim() ?? ''
      const nextPath = folderTitle ? [...path, folderTitle] : path
      const children = node.children ?? []
      for (let index = children.length - 1; index >= 0; index--) {
        pending.push({
          node: children[index],
          path: nextPath,
        })
      }
    }
  }

  const groupMap = new Map<string, ChromeBookmarkItem[]>()
  for (const item of items) {
    const key = normalizeUrl(item.url)
    const existing = groupMap.get(key)
    if (existing) {
      existing.push(item)
    } else {
      groupMap.set(key, [item])
    }
  }

  const duplicates: DuplicateGroup[] = []
  for (const [normalizedUrl, groupItems] of groupMap.entries()) {
    if (groupItems.length > 1) {
      groupItems.sort((a, b) => a.dateAdded - b.dateAdded)
      duplicates.push({
        url: groupItems[0].url,
        normalizedUrl,
        items: groupItems,
      })
    }
  }

  return duplicates.sort((a, b) => b.items.length - a.items.length)
}

export async function deleteDuplicateNodes(nodeIds: string[]): Promise<{ deletedCount: number; deletedUrls: string[] }> {
  if (typeof chrome === 'undefined' || !chrome.bookmarks || !nodeIds.length) {
    return { deletedCount: 0, deletedUrls: [] }
  }
  let deletedCount = 0
  const deletedUrls: string[] = []
  for (const id of nodeIds) {
    try {
      const [node] = await chrome.bookmarks.get(id)
      await chrome.bookmarks.remove(id)
      deletedCount++
      if (node?.url) deletedUrls.push(node.url)
    } catch {
      // 忽略可能已不存在或已被清理的节点
    }
  }
  return { deletedCount, deletedUrls }
}
