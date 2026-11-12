<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { CircleCheck, Collection, CopyDocument, Delete, Download, Link, Search, TopRight } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { liveQuery } from 'dexie'
import { changeBookmarks, deleteBookmarks, getAllBookmarks, importBookmarks, queryBookmarks, type Bookmark, type Sort } from './bookmarks'
import DuplicateDialog from './components/DuplicateDialog.vue'
import DeadLinkDialog from './components/DeadLinkDialog.vue'

const keyword = ref('')
const query = ref('')
const category = ref<string | null>(null)
const sort = ref<Sort>('newest')
const page = ref(1)
const sizes = [15, 30, 50, 100]
const size = ref(15)
const ready = ref(false)
const loading = ref(true)
const busy = ref(false)
const failed = ref(false)
const rows = ref<Bookmark[]>([])
const total = ref(0)
const count = ref(0)
const categories = ref<string[]>([])
const selected = ref(new Set<string>())
const deleteBrowserOriginals = ref(false)
const savingDeleteSetting = ref(false)
const deleteDialog = reactive({ open: false, ids: [] as string[], includeBrowser: false })
const moveDialog = reactive({ open: false, ids: [] as string[], category: null as string | null })
const isDuplicateDialogOpen = ref(false)
const isDeadLinkDialogOpen = ref(false)
const allBookmarks = ref<Bookmark[]>([])

async function openDeadLinkDialog() {
  try {
    allBookmarks.value = await getAllBookmarks()
    isDeadLinkDialogOpen.value = true
  } catch {
    ElMessage.error('无法读取书签库')
  }
}

function handleDeadLinksDelete(ids: string[]) {
  isDeadLinkDialogOpen.value = false
  openDeleteDialog(ids)
}
const unavailableIcons = reactive(new Set<string>())
const visibleSelected = computed(() => rows.value.filter(row => selected.value.has(row.id)).length)
const allChecked = computed(() => rows.value.length > 0 && visibleSelected.value === rows.value.length)
const categoryLabel = (name: string) => name || '未归类'

watch(keyword, (value, _, cleanup) => {
  if (!value.trim()) {
    query.value = ''
    return
  }
  const timer = setTimeout(() => { query.value = value.trim() }, 180)
  cleanup(() => clearTimeout(timer))
})
watch([query, category, sort, size], () => { page.value = 1 }, { flush: 'sync' })
watch([query, category], () => { selected.value = new Set() })
watch([ready, query, category, sort, page, size], ([isReady, term, group, order, current, limit], _, cleanup) => {
  if (!isReady) return
  loading.value = true
  failed.value = false
  const subscription = liveQuery(() => queryBookmarks(term, group, order, current, limit)).subscribe({
    next(data) {
      rows.value = data.rows
      total.value = data.total
      count.value = data.count
      categories.value = data.categories
      loading.value = false
      if (group && !data.categories.includes(group)) category.value = null
      if (data.currentPage !== current) page.value = data.currentPage
    },
    error(error) {
      loading.value = false
      failed.value = true
      ElMessage.error(error instanceof Error ? error.message : '无法读取本地书签库')
    },
  })
  cleanup(() => subscription.unsubscribe())
})

function syncDeleteSetting(changes: Record<string, chrome.storage.StorageChange>, area: string) {
  if (area === 'local' && changes.deleteBrowserOriginals) {
    deleteBrowserOriginals.value = changes.deleteBrowserOriginals.newValue === true
  }
}

async function saveDeleteSetting(value: unknown) {
  if (typeof value !== 'boolean' || savingDeleteSetting.value) return
  savingDeleteSetting.value = true
  try {
    await chrome.storage.local.set({ deleteBrowserOriginals: value })
    deleteBrowserOriginals.value = value
  } catch {
    ElMessage.error('删除设置保存失败，请重试')
  } finally {
    savingDeleteSetting.value = false
  }
}

onMounted(async () => {
  chrome.storage?.onChanged.addListener(syncDeleteSetting)
  try {
    const preferences = await chrome.storage?.local.get(['pageSize', 'sort', 'deleteBrowserOriginals'])
    const savedSize = preferences?.pageSize
    if (typeof savedSize === 'number' && sizes.includes(savedSize)) size.value = savedSize
    if (preferences?.sort === 'oldest') sort.value = 'oldest'
    deleteBrowserOriginals.value = preferences?.deleteBrowserOriginals === true
  } catch {
    ElMessage.warning('无法读取上次的扩展设置')
  } finally {
    ready.value = true
  }
})
onUnmounted(() => chrome.storage?.onChanged.removeListener(syncDeleteSetting))
watch([size, sort], async ([pageSize, order]) => {
  if (!ready.value) return
  try {
    await chrome.storage?.local.set({ pageSize, sort: order })
  } catch {
    ElMessage.warning('显示设置未能保存')
  }
})

function reset() {
  keyword.value = ''
  query.value = ''
  category.value = null
  page.value = 1
  selected.value = new Set()
}

function toggle(ids: string[], checked: boolean) {
  const next = new Set(selected.value)
  for (const id of ids) {
    if (checked) next.add(id)
    else next.delete(id)
  }
  selected.value = next
}

async function run(work: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  try {
    await work()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '操作失败，请重试')
  } finally {
    busy.value = false
  }
}

function sync() {
  return run(async () => {
    const { added, unsupported } = await importBookmarks(await chrome.bookmarks.getTree())
    const skipped = unsupported ? `，跳过 ${unsupported} 条非 HTTP(S) 书签` : ''
    ElMessage.success(`${added ? `已导入 ${added} 条书签` : '没有可导入的新书签'}${skipped}`)
  })
}

function openDeleteDialog(ids: string[]) {
  deleteDialog.ids = ids
  deleteDialog.includeBrowser = deleteBrowserOriginals.value
  deleteDialog.open = true
}

function confirmDelete() {
  const { ids, includeBrowser } = deleteDialog
  if (!ids.length) return
  return run(async () => {
    const { localDeleted, browserDeleted, failedIds } = await deleteBookmarks(ids, includeBrowser)
    const failed = new Set(failedIds)
    toggle(ids.filter(id => !failed.has(id)), false)
    deleteDialog.open = false
    const summary = includeBrowser
      ? `已删除 ${localDeleted} 条本地副本、${browserDeleted} 条浏览器原始书签。`
      : `已删除 ${localDeleted} 条本地副本。`
    if (failedIds.length) {
      ElMessage.warning(`${summary}另有 ${failedIds.length} 个网址的原始书签未能全部删除，已保留对应的本地副本。`)
    } else {
      ElMessage.success(summary)
    }
  })
}

function openMoveDialog() {
  moveDialog.ids = [...selected.value]
  moveDialog.category = null
  moveDialog.open = true
}

function moveSelected() {
  const { ids, category: group } = moveDialog
  if (!ids.length || group === null) return
  return run(async () => {
    const affected = await changeBookmarks(ids, group)
    toggle(ids, false)
    moveDialog.open = false
    ElMessage.success(`已将 ${affected} 条书签移至「${categoryLabel(group)}」`)
  })
}

function favicon(url: string) {
  const icon = new URL(chrome.runtime.getURL('_favicon/'))
  icon.searchParams.set('pageUrl', url)
  icon.searchParams.set('size', '32')
  return icon.href
}

function highlight(value: string) {
  const term = query.value.toLowerCase()
  if (!term) return [{ value, match: false }]
  const lower = value.toLowerCase()
  const parts: { value: string; match: boolean }[] = []
  let from = 0
  for (let index = lower.indexOf(term); index >= 0; index = lower.indexOf(term, from)) {
    parts.push({ value: value.slice(from, index), match: false }, { value: value.slice(index, index + term.length), match: true })
    from = index + term.length
  }
  parts.push({ value: value.slice(from), match: false })
  return parts
}

const dateFormat = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <el-config-provider :locale="zhCn">
  <header class="app-header">
    <div class="brand flex items-center gap-3">
      <span class="brand-icon"><el-icon :size="19"><Collection /></el-icon></span>
      <span>书签管家 <span class="brand-name">BookmarkDesk</span></span>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <el-switch
        :model-value="deleteBrowserOriginals"
        :disabled="!ready || busy || savingDeleteSetting"
        :loading="savingDeleteSetting"
        active-text="同时删除浏览器原始书签"
        aria-label="同时删除浏览器原始书签"
        @change="saveDeleteSetting"
      />
      <el-button type="primary" :icon="Download" :loading="busy" @click="sync">同步系统书签</el-button>
    </div>
  </header>

  <main class="workspace">
    <div class="intro flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1>书签工作台</h1>
        <p>检索和批量整理扩展中的本地书签。</p>
      </div>
      <div class="metrics flex">
        <div><span>有效书签</span><strong>{{ total.toLocaleString() }}</strong></div>
        <div><span>已勾选</span><strong>{{ selected.size.toLocaleString() }}</strong></div>
      </div>
    </div>

    <section class="filter-bar flex flex-wrap items-end gap-3" aria-label="筛选书签">
      <label class="filter-keyword">
        <span>关键字</span>
        <el-input v-model="keyword" :prefix-icon="Search" placeholder="搜索标题或网址" clearable aria-label="关键字" />
      </label>
      <label class="filter-select">
        <span>分类</span>
        <el-select v-model="category" placeholder="全部分类" clearable :value-on-clear="null" aria-label="分类">
          <el-option label="全部分类" :value="null" />
          <el-option label="未归类" value="" />
          <el-option v-for="name in categories" :key="name" :label="name" :value="name" />
        </el-select>
      </label>
      <el-button @click="reset">重置</el-button>
    </section>

    <section class="list-panel" aria-labelledby="bookmark-list">
      <div class="table-toolbar flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <h2 id="bookmark-list">书签列表</h2>
          <span class="count">{{ count.toLocaleString() }} 条</span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <el-button :icon="CopyDocument" :disabled="busy" @click="isDuplicateDialogOpen = true">重复检测</el-button>
          <el-button :icon="CircleCheck" :disabled="busy || !total" @click="openDeadLinkDialog">失效排查</el-button>
          <el-button v-if="selected.size" text @click="selected = new Set()">清空选择</el-button>
          <el-select v-model="sort" class="sort-select" aria-label="收藏时间排序">
            <el-option label="最近收藏" value="newest" />
            <el-option label="最早收藏" value="oldest" />
          </el-select>
          <el-button :disabled="!selected.size || busy" @click="openMoveDialog">移动分类</el-button>
          <el-button type="danger" plain :icon="Delete" :disabled="!selected.size || busy || savingDeleteSetting" @click="openDeleteDialog([...selected])">批量删除</el-button>
        </div>
      </div>
      <el-table v-loading="loading" :data="rows" row-key="id" height="100%" class="bookmark-table">
        <template #empty>
          <div class="empty-state">
            <el-icon :size="30"><Collection /></el-icon>
            <strong>{{ failed ? '无法读取书签' : total ? '没有匹配的书签' : '书签库还是空的' }}</strong>
            <p>{{ failed ? '刷新页面后重试。' : total ? '试试其他关键字或分类。' : '从浏览器导入已有书签。' }}</p>
            <el-button v-if="!failed && !total && !loading" :icon="Download" :disabled="busy" @click="sync">同步系统书签</el-button>
          </div>
        </template>
        <el-table-column width="48" align="center">
          <template #header>
            <el-checkbox :model-value="allChecked" :indeterminate="visibleSelected > 0 && !allChecked" :disabled="!rows.length || busy" aria-label="选择本页书签" @change="(value: unknown) => toggle(rows.map(row => row.id), value === true)" />
          </template>
          <template #default="{ row }">
            <el-checkbox :model-value="selected.has(row.id)" :disabled="busy" :aria-label="`选择 ${row.title}`" @change="(value: unknown) => toggle([row.id], value === true)" />
          </template>
        </el-table-column>
        <el-table-column label="网站信息" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <a class="site-link" :href="row.url" target="_blank" rel="noopener noreferrer">
              <img v-if="!unavailableIcons.has(row.url)" :src="favicon(row.url)" alt="" width="18" height="18" @error="unavailableIcons.add(row.url)">
              <el-icon v-else :size="18"><Link /></el-icon>
              <span><template v-for="(part, index) in highlight(row.title)" :key="index"><mark v-if="part.match">{{ part.value }}</mark><template v-else>{{ part.value }}</template></template></span>
            </a>
          </template>
        </el-table-column>
        <el-table-column label="网址链接" min-width="230" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="url"><template v-for="(part, index) in highlight(row.url)" :key="index"><mark v-if="part.match">{{ part.value }}</mark><template v-else>{{ part.value }}</template></template></span>
          </template>
        </el-table-column>
        <el-table-column label="分类" width="145" show-overflow-tooltip>
          <template #default="{ row }"><el-tag :type="row.category ? 'primary' : 'info'" effect="plain" size="small">{{ categoryLabel(row.category) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="收藏时间" width="155">
          <template #default="{ row }"><time class="time">{{ dateFormat.format(row.createdAt) }}</time></template>
        </el-table-column>
        <el-table-column label="操作" width="128" fixed="right">
          <template #default="{ row }">
            <div class="row-actions">
              <a :href="row.url" target="_blank" rel="noopener noreferrer"><el-icon><TopRight /></el-icon>访问</a>
              <el-button link type="danger" :disabled="busy || savingDeleteSetting" @click="openDeleteDialog([row.id])">删除</el-button>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <footer class="table-footer flex items-center justify-end">
        <el-pagination v-model:current-page="page" v-model:page-size="size" :page-sizes="sizes" :total="count" :pager-count="5" layout="sizes, prev, pager, next, jumper" />
      </footer>
    </section>
  </main>

  <el-dialog
    v-model="moveDialog.open"
    title="移动分类"
    width="min(420px, 94vw)"
    :close-on-click-modal="false"
    :close-on-press-escape="!busy"
    :show-close="!busy"
  >
    <p class="mb-3">选择这 {{ moveDialog.ids.length }} 条书签的目标分类。</p>
    <el-select
      v-model="moveDialog.category"
      class="w-full"
      filterable
      :empty-values="[null, undefined]"
      placeholder="请选择目标分类"
      aria-label="目标分类"
      :disabled="busy"
    >
      <el-option label="未归类" value="" />
      <el-option v-for="name in categories" :key="name" :label="name" :value="name" />
    </el-select>
    <template #footer>
      <el-button :disabled="busy" @click="moveDialog.open = false">取消</el-button>
      <el-button type="primary" :disabled="moveDialog.category === null" :loading="busy" @click="moveSelected">确认移动</el-button>
    </template>
  </el-dialog>
  <el-dialog
    v-model="deleteDialog.open"
    title="确认删除书签"
    width="min(460px, 94vw)"
    :close-on-click-modal="false"
    :close-on-press-escape="!busy"
    :show-close="!busy"
  >
    <p>将从 BookmarkDesk 删除 {{ deleteDialog.ids.length }} 条本地书签。</p>
    <p v-if="deleteDialog.includeBrowser" class="mt-2">同时删除浏览器原始书签。同一网址在不同文件夹里的原始书签也会被删除，BookmarkDesk 无法撤销此操作。</p>
    <p v-else class="mt-2">浏览器原始书签会保留。</p>
    <template #footer>
      <el-button :disabled="busy" @click="deleteDialog.open = false">取消</el-button>
      <el-button type="danger" :loading="busy" @click="confirmDelete">确认删除</el-button>
    </template>
  </el-dialog>

  <DuplicateDialog
    v-model="isDuplicateDialogOpen"
    @cleared="sync"
  />
  <DeadLinkDialog
    v-model="isDeadLinkDialogOpen"
    :bookmarks="allBookmarks"
    :include-browser="deleteBrowserOriginals"
    @delete-dead="handleDeadLinksDelete"
  />
  </el-config-provider>
</template>
