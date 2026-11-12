import Dexie, { type EntityTable } from 'dexie'

export interface Bookmark {
  id: string
  title: string
  url: string
  category: string
  createdAt: number
}

export type Sort = 'newest' | 'oldest'

const db = new Dexie('bookmarkdesk') as Dexie & {
  bookmarks: EntityTable<Bookmark, 'id'>
  categories: EntityTable<{ name: string }, 'name'>
}
db.version(1).stores({
  bookmarks: 'id,&url,category,createdAt,[category+createdAt]',
  categories: 'name',
})

function parseUrl(value: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol === 'http:' || url.protocol === 'https:') return url
  } catch {
    return
  }
}

export async function getAllBookmarks(): Promise<Bookmark[]> {
  try {
    return await db.bookmarks.toArray()
  } catch {
    return []
  }
}

export async function queryBookmarks(keyword: string, category: string | null, sort: Sort, page: number, size: number) {
  const base = () => category === null
    ? db.bookmarks.orderBy('createdAt')
    : db.bookmarks.where('[category+createdAt]').between([category, Dexie.minKey], [category, Dexie.maxKey], true, true)
  const term = keyword.trim().toLowerCase()
  const filtered = () => {
    const list = base()
    if (sort === 'newest') list.reverse()
    if (term) list.filter(row => row.title.toLowerCase().includes(term) || row.url.toLowerCase().includes(term))
    return list
  }
  return db.transaction('r', db.bookmarks, db.categories, async () => {
    const [total, count, categories] = await Promise.all([
      db.bookmarks.count(), filtered().count(), db.categories.orderBy('name').primaryKeys(),
    ])
    const currentPage = Math.min(page, Math.max(1, Math.ceil(count / size)))
    const rows = await filtered().offset((currentPage - 1) * size).limit(size).toArray()
    return { total, count, categories, currentPage, rows }
  })
}

export async function importBookmarks(tree: chrome.bookmarks.BookmarkTreeNode[]) {
  const candidates = new Map<string, Bookmark>()
  const pending = tree.map(node => ({ node, category: '' })).reverse()
  let unsupported = 0
  while (pending.length) {
    const { node, category } = pending.pop()!
    if (node.url) {
      const url = parseUrl(node.url)
      if (!url) {
        unsupported++
        continue
      }
      if (!candidates.has(url.href)) {
        candidates.set(url.href, { id: crypto.randomUUID(), title: node.title.trim() || url.hostname, url: url.href, category, createdAt: node.dateAdded ?? Date.now() })
      }
    } else {
      for (let index = (node.children?.length ?? 0) - 1; index >= 0; index--) {
        pending.push({ node: node.children![index], category: node.title.trim() })
      }
    }
  }
  return db.transaction('rw', db.bookmarks, db.categories, async () => {
    const existing = new Set(await db.bookmarks.where('url').anyOf([...candidates.keys()]).keys())
    const rows = [...candidates.values()].filter(row => !existing.has(row.url))
    await db.bookmarks.bulkAdd(rows)
    await db.categories.bulkPut([...new Set(rows.map(row => row.category).filter(Boolean))].map(name => ({ name })))
    return { added: rows.length, unsupported }
  })
}

async function removeEmptyCategories(categories: string[]) {
  for (const name of new Set(categories.filter(Boolean))) {
    if (!(await db.bookmarks.where('category').equals(name).first())) await db.categories.delete(name)
  }
}

export async function changeBookmarks(ids: string[], category?: string) {
  return db.transaction('rw', db.bookmarks, db.categories, async () => {
    const rows = (await db.bookmarks.bulkGet(ids)).filter(row => row !== undefined)
    if (category === undefined) {
      await db.bookmarks.bulkDelete(rows.map(row => row.id))
    } else if (rows.length) {
      await db.bookmarks.bulkPut(rows.map(row => ({ ...row, category })))
      if (category) await db.categories.put({ name: category })
    }
    await removeEmptyCategories(rows.map(row => row.category))
    return rows.length
  })
}

function hasBookmarks(node: chrome.bookmarks.BookmarkTreeNode): boolean {
  if (node.url) return true
  return (node.children ?? []).some(hasBookmarks)
}

async function removeBrowserFolders(categories: string[]) {
  if (!categories.length || typeof chrome === 'undefined' || !chrome.bookmarks) return
  const targetNames = new Set(categories)
  let tree: chrome.bookmarks.BookmarkTreeNode[] = []
  try {
    tree = await chrome.bookmarks.getTree()
  } catch {
    return
  }

  const foldersToRemove: chrome.bookmarks.BookmarkTreeNode[] = []
  const pending = [...tree]

  while (pending.length) {
    const node = pending.pop()!
    for (const child of node.children ?? []) pending.push(child)

    const isFolder = !node.url
    const isRoot = !node.parentId || node.parentId === '0' || ['0', '1', '2', '3'].includes(node.id)
    if (isFolder && !isRoot && targetNames.has(node.title?.trim()) && !hasBookmarks(node)) {
      foldersToRemove.push(node)
    }
  }

  for (const folder of foldersToRemove) {
    try {
      const [current] = await chrome.bookmarks.get(folder.id)
      if (current) {
        await chrome.bookmarks.removeTree(folder.id)
      }
    } catch {
      // 忽略已被级联删除或不存在的节点
    }
  }
}

export async function deleteBookmarks(ids: string[], includeBrowser: boolean) {
  if (!includeBrowser) {
    try {
      const localDeleted = await changeBookmarks(ids)
      return { localDeleted, browserDeleted: 0, failedIds: [] as string[] }
    } catch (error) {
      throw error instanceof Error ? error : new Error('删除本地书签失败')
    }
  }

  let rows: Bookmark[] = []
  try {
    rows = (await db.bookmarks.bulkGet(ids)).filter((row): row is Bookmark => row !== undefined)
  } catch {
    return { localDeleted: 0, browserDeleted: 0, failedIds: [] }
  }
  if (!rows.length) return { localDeleted: 0, browserDeleted: 0, failedIds: [] }

  const targets = new Set(rows.map(row => row.url))
  const failedUrls = new Set<string>()
  let pending: chrome.bookmarks.BookmarkTreeNode[] = []
  try {
    pending = await chrome.bookmarks.getTree()
  } catch {
    return { localDeleted: 0, browserDeleted: 0, failedIds: ids }
  }
  let browserDeleted = 0

  while (pending.length) {
    const node = pending.pop()!
    for (const child of node.children ?? []) pending.push(child)
    const url = node.url && parseUrl(node.url)?.href
    if (!url || !targets.has(url)) continue

    try {
      const [current] = await chrome.bookmarks.get(node.id)
      if (current?.url && parseUrl(current.url)?.href === url) {
        await chrome.bookmarks.remove(node.id)
        browserDeleted++
      }
    } catch {
      failedUrls.add(url)
    }
  }

  const failedIds = rows.filter(row => failedUrls.has(row.url)).map(row => row.id)
  const localIds = rows.filter(row => !failedUrls.has(row.url)).map(row => row.id)
  try {
    const localDeleted = await changeBookmarks(localIds)

    const affectedCategories = [
      ...new Set(
        rows
          .filter(row => !failedUrls.has(row.url))
          .map(row => row.category?.trim())
          .filter((name): name is string => Boolean(name))
      ),
    ]

    const emptyCategories: string[] = []
    for (const cat of affectedCategories) {
      try {
        const hasRemaining = await db.bookmarks.where('category').equals(cat).first()
        if (!hasRemaining) {
          emptyCategories.push(cat)
        }
      } catch {
        // 忽略单项查询异常
      }
    }

    if (emptyCategories.length) {
      try {
        await removeBrowserFolders(emptyCategories)
      } catch {
        // 忽略清理浏览器空文件夹异常
      }
    }

    return { localDeleted, browserDeleted, failedIds }
  } catch {
    throw new Error(`已删除 ${browserDeleted} 条浏览器原始书签，但本地库更新失败。请重试清理本地副本。`)
  }
}
