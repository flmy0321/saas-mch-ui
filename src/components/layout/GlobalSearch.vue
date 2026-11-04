<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { refDebounced, useMagicKeys, whenever } from '@vueuse/core'
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogDescription } from 'reka-ui'
import { CornerDownLeft, FileText, Loader2, Receipt, Search, Store, Undo2 } from '@lucide/vue'
import { api } from '@/services/api'
import { useAppStore } from '@/stores/app'
import { NAVIGATION } from '@/app/navigation'
import type { GlobalSearchResult } from '@/types'
import { cn } from '@/utils/cn'

const router = useRouter()
const { searchOpen } = storeToRefs(useAppStore())
const keyword = ref('')
const debounced = refDebounced(keyword, 220)
const results = ref<GlobalSearchResult[]>([])
const loading = ref(false)
const active = ref(0)

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

const pages = computed(() => {
  const k = keyword.value.trim()
  return NAVIGATION.flatMap((g) =>
    g.children.map((c) => ({ type: 'page' as const, id: c.to, title: c.label, subtitle: g.label, to: c.to })),
  ).filter((p) => !k || p.title.includes(k) || p.subtitle.includes(k))
})

const items = computed(() => [...results.value, ...pages.value.slice(0, keyword.value ? 4 : 6)])

watch(debounced, async (k) => {
  const q = k.trim()
  if (!q) {
    results.value = []
    return
  }
  loading.value = true
  try {
    results.value = await api.search(q)
  } catch {
    results.value = []
  } finally {
    loading.value = false
    active.value = 0
  }
})

watch(searchOpen, (v) => {
  if (!v) {
    keyword.value = ''
    results.value = []
    active.value = 0
  }
})

function go(to: string) {
  searchOpen.value = false
  router.push(to)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = (active.value + 1) % Math.max(1, items.value.length)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = (active.value - 1 + items.value.length) % Math.max(1, items.value.length)
  } else if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
    const it = items.value[active.value]
    if (it) go(it.to)
  }
}

const iconOf = { payment: Receipt, refund: Undo2, store: Store, page: FileText }
const typeLabel = { payment: '支付订单', refund: '退款', store: '门店', page: '页面' }
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
            placeholder="搜索订单号、商户订单号、退款编号、门店…"
            class="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            @keydown="onKeydown"
          />
          <kbd class="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">ESC</kbd>
        </div>
        <ul id="global-search-list" role="listbox" class="max-h-[50vh] overflow-y-auto p-1.5">
          <li
            v-if="keyword && !loading && !results.length && !pages.length"
            class="px-3 py-10 text-center text-sm text-muted-foreground"
          >
            未找到与「{{ keyword }}」相关的结果
          </li>
          <li
            v-for="(it, i) in items"
            :key="`${it.type}-${it.id}`"
            role="option"
            :aria-selected="i === active"
            :class="
              cn(
                'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2',
                i === active ? 'bg-muted' : 'hover:bg-muted/60',
              )
            "
            @mouseenter="active = i"
            @click="go(it.to)"
          >
            <span class="flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card">
              <component :is="iconOf[it.type]" class="size-3.5 text-muted-foreground" aria-hidden="true" />
            </span>
            <div class="min-w-0 flex-1">
              <p :class="cn('truncate text-sm', it.type !== 'page' && it.type !== 'store' && 'font-mono text-[13px]')">
                {{ it.title }}
              </p>
              <p class="truncate text-xs text-muted-foreground">{{ it.subtitle }}</p>
            </div>
            <span class="text-[11px] text-muted-foreground">{{ typeLabel[it.type] }}</span>
            <CornerDownLeft v-if="i === active" class="size-3.5 text-muted-foreground" aria-hidden="true" />
          </li>
        </ul>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
