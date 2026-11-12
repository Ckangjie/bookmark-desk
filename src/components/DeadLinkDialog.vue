<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CircleClose, Delete, Refresh, Search, TopRight, VideoPause, VideoPlay, Warning } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { Bookmark } from '../bookmarks'
import { checkBookmarkList, checkSingleUrl, type LinkCheckItem } from '../utils/linkChecker'

const props = defineProps<{
  modelValue: boolean
  bookmarks: Bookmark[]
  includeBrowser: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'deleteDead', ids: string[]): void
}>()

const isChecking = ref(false)
const checkedCount = ref(0)
const results = ref<LinkCheckItem[]>([])
const selectedIds = ref(new Set<string>())
const shouldShowOnlyBroken = ref(true)
const abortController = ref<AbortController | null>(null)

const totalCount = computed(() => props.bookmarks.length)
const progressPercent = computed(() =>
  totalCount.value ? Math.min(100, Math.round((checkedCount.value / totalCount.value) * 100)) : 0
)

const brokenResults = computed(() => results.value.filter(item => item.isBroken))
const displayedResults = computed(() => (shouldShowOnlyBroken.value ? brokenResults.value : results.value))

const normalCount = computed(() => results.value.filter(item => !item.isBroken).length)
const errorCount = computed(() => results.value.filter(item => item.isBroken && !item.isTimeout).length)
const timeoutCount = computed(() => results.value.filter(item => item.isTimeout).length)
const selectedCount = computed(() => selectedIds.value.size)
const canDelete = computed(() => selectedCount.value > 0)
const isAllSelected = computed(
  () => displayedResults.value.length > 0 && displayedResults.value.every(r => selectedIds.value.has(r.id))
)

function stopCheck() {
  if (abortController.value) {
    abortController.value.abort()
    abortController.value = null
  }
  isChecking.value = false
}

function resetState() {
  stopCheck()
  checkedCount.value = 0
  results.value = []
  selectedIds.value = new Set()
  shouldShowOnlyBroken.value = true
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (!isOpen) {
      resetState()
    }
  }
)

async function startCheck() {
  if (isChecking.value || !props.bookmarks.length) return
  isChecking.value = true
  checkedCount.value = 0
  results.value = []
  selectedIds.value = new Set()

  const controller = new AbortController()
  abortController.value = controller

  try {
    const finalResults = await checkBookmarkList(
      props.bookmarks,
      6,
      (_item, count) => {
        checkedCount.value = count
      },
      controller.signal
    )
    results.value = finalResults
    // 默认自动全选检测出的失效项
    const brokenIds = new Set(finalResults.filter(r => r.isBroken).map(r => r.id))
    selectedIds.value = brokenIds
  } catch {
    ElMessage.error('排查过程发生异常')
  } finally {
    isChecking.value = false
    abortController.value = null
  }
}

function toggleSelect(id: string, isChecked: boolean) {
  const next = new Set(selectedIds.value)
  if (isChecked) {
    next.add(id)
  } else {
    next.delete(id)
  }
  selectedIds.value = next
}

function toggleSelectAll(isChecked: boolean) {
  const next = new Set(selectedIds.value)
  for (const item of displayedResults.value) {
    if (isChecked) {
      next.add(item.id)
    } else {
      next.delete(item.id)
    }
  }
  selectedIds.value = next
}

async function recheckSingle(row: LinkCheckItem) {
  try {
    const res = await checkSingleUrl(row.url)
    const index = results.value.findIndex(item => item.id === row.id)
    if (index !== -1) {
      results.value[index] = {
        ...results.value[index],
        status: res.status,
        message: res.message,
        isBroken: res.isBroken,
        isTimeout: res.isTimeout,
        checkedAt: Date.now(),
      }
    }
    if (!res.isBroken) {
      selectedIds.value.delete(row.id)
      ElMessage.success(`链接「${row.title}」已恢复正常`)
    } else {
      ElMessage.warning(`重新检测完成：${res.message}`)
    }
  } catch {
    ElMessage.error('重测失败')
  }
}

function handleDeleteSelected() {
  if (!canDelete.value) return
  emit('deleteDead', [...selectedIds.value])
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    title="失效链接排查"
    width="min(920px, 95vw)"
    :close-on-click-modal="false"
    :close-on-press-escape="!isChecking"
    :show-close="!isChecking"
    @closed="resetState"
    @update:model-value="(val: boolean) => emit('update:modelValue', val)"
  >
    <div class="deadlink-panel space-y-4">
      <div class="control-bar flex flex-wrap items-center justify-between gap-3 p-3 bg-gray-50/70 dark:bg-gray-800/40 rounded border border-gray-200/70 dark:border-gray-700/70">
        <div class="flex flex-wrap items-center gap-3">
          <el-button
            v-if="!isChecking"
            type="primary"
            :icon="results.length ? Refresh : VideoPlay"
            :disabled="!totalCount"
            @click="startCheck"
          >
            {{ results.length ? '重新完整排查' : '开始排查链接' }}
          </el-button>
          <el-button
            v-else
            type="warning"
            :icon="VideoPause"
            @click="stopCheck"
          >
            停止排查
          </el-button>
          <span class="text-xs text-gray-500">
            待测总数 <strong>{{ totalCount }}</strong> 条
          </span>
        </div>

        <div class="stat-tags flex flex-wrap items-center gap-2 text-xs">
          <el-tag type="success" effect="plain">正常 {{ normalCount }}</el-tag>
          <el-tag type="danger" effect="plain">异常响应 {{ errorCount }}</el-tag>
          <el-tag type="warning" effect="plain">超时/断连 {{ timeoutCount }}</el-tag>
        </div>
      </div>

      <div v-if="isChecking || checkedCount > 0" class="progress-box space-y-1">
        <div class="flex items-center justify-between text-xs text-gray-500">
          <span>进度：{{ checkedCount }} / {{ totalCount }}</span>
          <span>{{ progressPercent }}%</span>
        </div>
        <el-progress
          :percentage="progressPercent"
          :status="progressPercent === 100 ? (brokenResults.length ? 'exception' : 'success') : ''"
          :indeterminate="false"
        />
      </div>

      <div class="table-actions flex items-center justify-between gap-2 pt-1">
        <div class="flex items-center gap-2">
          <el-switch
            v-model="shouldShowOnlyBroken"
            active-text="仅看问题链接"
            size="small"
          />
          <span class="text-xs text-gray-400">
            共列出 {{ displayedResults.length }} 条
          </span>
        </div>
        <div v-if="displayedResults.length" class="flex items-center gap-2">
          <el-button size="small" text @click="toggleSelectAll(!isAllSelected)">
            {{ isAllSelected ? '取消全选' : '全选当前列表' }}
          </el-button>
        </div>
      </div>

      <el-table
        :data="displayedResults"
        row-key="id"
        max-height="380px"
        class="result-table"
      >
        <template #empty>
          <div class="py-8 text-center text-gray-400">
            <el-icon :size="32" class="mb-2"><CircleClose /></el-icon>
            <p>{{ isChecking ? '正在检测中，请稍候...' : results.length ? '太棒了，没有检测到失效链接！' : '点击「开始排查」开始批量测试链接连通性' }}</p>
          </div>
        </template>

        <el-table-column width="48" align="center">
          <template #header>
            <el-checkbox
              :model-value="isAllSelected"
              :disabled="!displayedResults.length"
              @change="(val: unknown) => toggleSelectAll(val === true)"
            />
          </template>
          <template #default="{ row }">
            <el-checkbox
              :model-value="selectedIds.has(row.id)"
              @change="(val: unknown) => toggleSelect(row.id, val === true)"
            />
          </template>
        </el-table-column>

        <el-table-column label="网站信息" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="font-medium text-sm truncate">{{ row.title }}</div>
            <a
              :href="row.url"
              target="_blank"
              rel="noopener noreferrer"
              class="url-subtext text-xs text-gray-400 hover:text-blue-500 hover:underline truncate block"
            >
              {{ row.url }}
            </a>
          </template>
        </el-table-column>

        <el-table-column label="分类" width="120" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag size="small" type="info" effect="plain">{{ row.category || '未归类' }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column label="检测状态" width="160">
          <template #default="{ row }">
            <div class="flex items-center gap-1.5">
              <el-tag
                v-if="row.isTimeout"
                type="warning"
                size="small"
                effect="dark"
              >
                超时
              </el-tag>
              <el-tag
                v-else-if="row.status"
                :type="row.isBroken ? 'danger' : 'success'"
                size="small"
                effect="dark"
              >
                {{ row.status }}
              </el-tag>
              <el-tag
                v-else
                type="danger"
                size="small"
                effect="plain"
              >
                断开
              </el-tag>
              <span class="text-xs text-gray-500 truncate" :title="row.message">
                {{ row.message }}
              </span>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="120" fixed="right" align="center">
          <template #default="{ row }">
            <div class="flex items-center justify-center gap-2">
              <el-button
                link
                size="small"
                :disabled="isChecking"
                @click="recheckSingle(row)"
              >
                重测
              </el-button>
              <a
                :href="row.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-blue-500 hover:underline flex items-center gap-0.5"
              >
                访问<el-icon><TopRight /></el-icon>
              </a>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <template #footer>
      <div class="dialog-footer flex items-center justify-between">
        <span class="text-xs text-gray-500">
          已选中 <strong>{{ selectedCount }}</strong> 条失效书签
          <span v-if="props.includeBrowser" class="text-orange-500 ml-1">（将同步删除浏览器原始书签）</span>
        </span>
        <div class="flex items-center gap-2">
          <el-button @click="emit('update:modelValue', false)">关闭</el-button>
          <el-button
            type="danger"
            :icon="Delete"
            :disabled="!canDelete || isChecking"
            @click="handleDeleteSelected"
          >
            删除选中书签 ({{ selectedCount }})
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.url-subtext {
  max-width: 100%;
}
</style>
