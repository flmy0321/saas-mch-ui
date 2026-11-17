<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { refDebounced, useMagicKeys, whenever } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogDescription } from 'reka-ui'
import { CornerDownLeft, FileText, Loader2, Lock, Receipt, Search, Store, Undo2 } from '@lucide/vue'
import { api } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { NAVIGATION } from '@/app/navigation'
import type { GlobalSearchGroup, SearchGroupType } from '@/types'
import { cn } from '@/utils/cn'

interface Row {
  key: string
  type: SearchGroupType | 'page'
  title: string
  subtitle?: string
  to: string
  index: number
}

const router = useRouter()
const { searchOpen } = storeToRefs(useAppStore())
const keyword = ref('')
const debounced = refDebounced(keyword, 220)
const groups = ref<GlobalSearchGroup[]>([])
const failed = ref(false)
const loading = ref(false)
const active = ref(0)
let seq = 0

const keys = useMagicKeys({
  passive: false,
  onEventFired(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k' && e.type === 'keydown') e.preventDefault()
  },
})
whenever(
  () => (keys['Meta+K']?.value || keys['Ctrl+K']?.value) ?? false,
  () => (searchOpen.value = true),
)

const groupLabel: Record<SearchGroupType, string> = { payment: '支付订单', refund: '退款', store: '门店' }
const iconOf = { payment: Receipt, refund: Undo2, store: Store, page: FileText }

const pages = computed(() => {
  const k = keyword.value.trim()
  return NAVIGATION.flatMap((g) => g.children.map((c) => ({ title: c.label, subtitle: g.label, to: c.to })))
    .filter((p) => !k || p.title.includes(k) || p.subtitle.includes(k))
    .slice(0, k ? 4 : 6)
})

/** 分组与页面按显示顺序编号，供键盘导航使用 */
const layout = computed(() => {
  let i = 0
  const sections = groups.value.map((g) => ({
    group: g,
    rows: g.state === 'OK'
      ? g.items.map((it): Row => ({ key: `${g.type}-${it.id}`, type: g.type, title: it.title, to: it.to, index: i++ }))
      : [],
  }))
  const pageRows = pages.value.map((p): Row => ({ key: `page-${p.to}`, type: 'page', title: p.title, subtitle: p.subtitle, to: p.to, index: i++ }))
  return { sections, pageRows, rows: [...sections.flatMap((s) => s.rows), ...pageRows] }
})

function stateMessage(g: GlobalSearchGroup): string | null {
  const label = groupLabel[g.type]
  if (g.state === 'NOT_AUTHORIZED') return `无权限查看${label}`
  if (g.state === 'NOT_APPLICABLE') return `该关键词不适用于${label}搜索`
  if (!g.items.length) return `没有匹配的${label}`
  return null
}

watch(debounced, async (k) => {
  const q = k.trim()
  const mine = ++seq
  failed.value = false
  if (!q) {
    groups.value = []
    return
  }
  loading.value = true
  try {
    const view = await api.search(q)
    if (mine === seq) groups.value = view.groups
  } catch {
    if (mine === seq) {
      groups.value = []
      failed.value = true
    }
  } finally {
    if (mine === seq) {
      loading.value = false
      active.value = 0
    }
  }
})

watch(searchOpen, (v) => {
  if (!v) {
    seq++
    keyword.value = ''
    groups.value = []
    failed.value = false
    loading.value = false
    active.value = 0
  }
})

function go(to: string) {
  searchOpen.value = false
  router.push(to)
}

function onKeydown(e: KeyboardEvent) {
  const count = Math.max(1, layout.value.rows.length)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = (active.value + 1) % count
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = (active.value - 1 + count) % count
  } else if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
    const row = layout.value.rows[active.value]
    if (row) go(row.to)
  }
}
</script>

<template>
  <DialogRoot v-model:open="searchOpen">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogContent
        class="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-popover shadow-overlay outline-none"
      >
        <DialogTitle class="sr-only">全局搜索</DialogTitle>
        <DialogDescription class="sr-only">搜索支付订单号、商户订单号、退款编号或门店</DialogDescription>
        <div class="flex h-12 items-center gap-2.5 border-b border-border px-4">
          <Loader2 v-if="loading" class="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
          <Search v-else class="size-4 text-muted-foreground" aria-hidden="true" />
          <input
            v-model="keyword"
            autofocus
            role="combobox"
            aria-expanded="true"
            aria-controls="global-search-list"
            :aria-activedescendant="layout.rows[active] ? `search-opt-${active}` : undefined"
            placeholder="搜索订单号、商户订单号、退款编号、门店…"
            class="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            @keydown="onKeydown"
          />
          <kbd class="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <div id="global-search-list" role="listbox" aria-label="搜索结果" class="flex max-h-[50vh] flex-col gap-1 overflow-y-auto p-1.5">
          <p v-if="failed" role="status" class="px-3 py-6 text-center text-sm text-destructive">搜索失败，请稍后重试</p>

          <section v-for="s in layout.sections" :key="s.group.type" role="group" :aria-label="groupLabel[s.group.type]">
            <div class="flex items-center justify-between px-3 pt-2 pb-1">
              <h3 class="text-[11px] font-medium text-muted-foreground">{{ groupLabel[s.group.type] }}</h3>
              <span v-if="s.group.hasMore" class="text-[11px] text-muted-foreground">仅显示前 {{ s.group.items.length }} 条，请细化关键词</span>
            </div>
            <p v-if="stateMessage(s.group)" class="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
              <Lock v-if="s.group.state === 'NOT_AUTHORIZED'" class="size-3.5" aria-hidden="true" />
              {{ stateMessage(s.group) }}
            </p>
            <div
              v-for="row in s.rows"
              :id="`search-opt-${row.index}`"
              :key="row.key"
              role="option"
              :aria-selected="row.index === active"
              :class="cn('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2', row.index === active ? 'bg-muted' : 'hover:bg-muted/60')"
              @mouseenter="active = row.index"
              @click="go(row.to)"
            >
              <span class="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                <component :is="iconOf[row.type]" class="size-3.5 text-muted-foreground" aria-hidden="true" />
              </span>
              <p :class="cn('min-w-0 flex-1 truncate text-sm', row.type !== 'store' && 'font-mono text-[13px]')">{{ row.title }}</p>
              <CornerDownLeft v-if="row.index === active" class="size-3.5 text-muted-foreground" aria-hidden="true" />
            </div>
          </section>

          <section v-if="layout.pageRows.length" role="group" aria-label="页面">
            <h3 class="px-3 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">页面</h3>
            <div
              v-for="row in layout.pageRows"
              :id="`search-opt-${row.index}`"
              :key="row.key"
              role="option"
              :aria-selected="row.index === active"
              :class="cn('flex cursor-pointer items-center gap-3 rounded-md px-3 py-2', row.index === active ? 'bg-muted' : 'hover:bg-muted/60')"
              @mouseenter="active = row.index"
              @click="go(row.to)"
            >
              <span class="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card">
                <FileText class="size-3.5 text-muted-foreground" aria-hidden="true" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm">{{ row.title }}</p>
                <p class="truncate text-xs text-muted-foreground">{{ row.subtitle }}</p>
              </div>
              <CornerDownLeft v-if="row.index === active" class="size-3.5 text-muted-foreground" aria-hidden="true" />
            </div>
          </section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
