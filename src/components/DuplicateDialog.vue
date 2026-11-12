<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CopyDocument, Delete, Link, Refresh, TopRight } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteDuplicateNodes, scanDuplicateBookmarks, type DuplicateGroup } from '../utils/duplicateChecker'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'cleared'): void
}>()

const isLoading = ref(false)
const isDeleting = ref(false)
const groups = ref<DuplicateGroup[]>([])
const selectedNodeIds = ref(new Set<string>())

const totalDuplicateItems = computed(() =>
  groups.value.reduce((accum, group) => accum + group.items.length, 0)
)
const totalRedundantCount = computed(() =>
  groups.value.reduce((accum, group) => accum + Math.max(0, group.items.length - 1), 0)
)
const selectedCount = computed(() => selectedNodeIds.value.size)
const hasDuplicates = computed(() => groups.value.length > 0)
const canDelete = computed(() => selectedCount.value > 0 && !isDeleting.value)

const dateFormat = new Intl.DateTimeFormat('sv-SE', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

async function scan() {
  if (isLoading.value) return
  isLoading.value = true
  selectedNodeIds.value = new Set()
  try {
    groups.value = await scanDuplicateBookmarks()
  } catch {
    ElMessage.error('读取书签重复项失败')
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      scan()
    } else {
      groups.value = []
      selectedNodeIds.value = new Set()
    }
  }
)

function toggleItem(nodeId: string, isChecked: boolean) {
  const next = new Set(selectedNodeIds.value)
  if (isChecked) {
    next.add(nodeId)
  } else {
    next.delete(nodeId)
  }
  selectedNodeIds.value = next
}

function selectStrategy(strategy: 'keepOldest' | 'keepNewest') {
  const next = new Set<string>()
  for (const group of groups.value) {
    if (group.items.length <= 1) continue
    if (strategy === 'keepOldest') {
      // 保持第 0 项（最早），勾选后续项进行清理
      for (let index = 1; index < group.items.length; index++) {
        next.add(group.items[index].id)
      }
    } else {
      // 保持最后 1 项（最新），勾选之前项进行清理
      for (let index = 0; index < group.items.length - 1; index++) {
        next.add(group.items[index].id)
      }
    }
  }
  selectedNodeIds.value = next
}

function clearSelection() {
  selectedNodeIds.value = new Set()
}

async function confirmDelete() {
  if (!canDelete.value) return
  try {
    await ElMessageBox.confirm(
      `确定从浏览器中删除已勾选的 ${selectedCount.value} 条重复书签副本吗？此操作无法撤销。`,
      '确认清理重复书签',
      {
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
  } catch {
    return
  }

  isDeleting.value = true
  try {
    const deletedCount = await deleteDuplicateNodes([...selectedNodeIds.value])
    ElMessage.success(`已清理 ${deletedCount} 条重复书签`)
    emit('cleared')
    await scan()
  } catch {
    ElMessage.error('清理重复项失败，请重试')
  } finally {
    isDeleting.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="props.modelValue"
    title="重复网址检测"
    width="min(860px, 95vw)"
    :close-on-click-modal="false"
    :close-on-press-escape="!isDeleting"
    :show-close="!isDeleting"
    @update:model-value="(val: boolean) => emit('update:modelValue', val)"
  >
    <div class="duplicate-panel">
      <div class="header-bar flex flex-wrap items-center justify-between gap-3 mb-4">
        <div class="summary-info">
          <span v-if="isLoading" class="text-gray-500">正在扫描浏览器书签...</span>
          <span v-else-if="hasDuplicates" class="text-sm">
            共发现 <strong>{{ groups.length }}</strong> 组重复网址，涉及
            <strong>{{ totalDuplicateItems }}</strong> 条书签（多余副本
            <strong>{{ totalRedundantCount }}</strong> 条）
          </span>
          <span v-else class="text-sm text-gray-500">未检测到重复的书签网址</span>
        </div>
        <div class="actions flex items-center gap-2">
          <el-button size="small" :icon="Refresh" :disabled="isLoading || isDeleting" @click="scan">重新扫描</el-button>
          <template v-if="hasDuplicates">
            <el-button size="small" :disabled="isDeleting" @click="selectStrategy('keepOldest')">保留最早添加</el-button>
            <el-button size="small" :disabled="isDeleting" @click="selectStrategy('keepNewest')">保留最新添加</el-button>
            <el-button v-if="selectedCount > 0" size="small" text @click="clearSelection">清空勾选</el-button>
          </template>
        </div>
      </div>

      <div v-loading="isLoading" class="group-container">
        <div v-if="!isLoading && !hasDuplicates" class="empty-box py-8 text-center text-gray-400">
          <el-icon :size="36" class="mb-2"><CopyDocument /></el-icon>
          <p>太棒了，当前浏览器中没有重复的网址！</p>
        </div>

        <el-scrollbar v-else max-height="460px">
          <div class="group-list space-y-4 pr-3">
            <div
              v-for="(group, gIndex) in groups"
              :key="gIndex"
              class="group-card p-3 rounded border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40"
            >
              <div class="group-head flex items-center justify-between gap-2 mb-2 pb-2 border-b border-gray-200/60 dark:border-gray-700/60">
                <div class="url-label flex items-center gap-2 min-w-0">
                  <el-icon class="text-blue-500"><Link /></el-icon>
                  <a
                    :href="group.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="url-text truncate text-sm font-medium hover:underline"
                    :title="group.url"
                  >
                    {{ group.url }}
                  </a>
                </div>
                <el-tag size="small" type="warning" effect="plain">{{ group.items.length }} 处重复</el-tag>
              </div>

              <div class="items-list space-y-2">
                <div
                  v-for="item in group.items"
                  :key="item.id"
                  class="item-row flex items-center justify-between gap-3 text-xs p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700/50"
                >
                  <div class="flex items-center gap-2 min-w-0 flex-1">
                    <el-checkbox
                      :model-value="selectedNodeIds.has(item.id)"
                      :disabled="isDeleting"
                      @change="(val: unknown) => toggleItem(item.id, val === true)"
                    />
                    <span class="item-title truncate font-medium text-gray-800 dark:text-gray-200" :title="item.title">
                      {{ item.title }}
                    </span>
                    <el-tag size="small" type="info" effect="light" class="folder-tag truncate max-w-48">
                      {{ item.folderPath }}
                    </el-tag>
                  </div>
                  <div class="flex items-center gap-3 shrink-0 text-gray-400">
                    <time>{{ dateFormat.format(item.dateAdded) }}</time>
                    <a :href="item.url" target="_blank" rel="noopener noreferrer" class="hover:text-blue-500">
                      <el-icon><TopRight /></el-icon>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer flex items-center justify-between">
        <span class="text-xs text-gray-500">
          已选中 <strong>{{ selectedCount }}</strong> 条待删除副本
        </span>
        <div class="flex items-center gap-2">
          <el-button :disabled="isDeleting" @click="emit('update:modelValue', false)">取消</el-button>
          <el-button
            type="danger"
            :icon="Delete"
            :loading="isDeleting"
            :disabled="!canDelete"
            @click="confirmDelete"
          >
            清理已选重复项 ({{ selectedCount }})
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.group-card {
  transition: border-color 0.2s;
}
.group-card:hover {
  border-color: var(--el-color-primary-light-5);
}
.url-text {
  color: var(--el-color-primary);
}
</style>
