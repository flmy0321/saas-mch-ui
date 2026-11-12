<script setup lang="ts">
import { computed } from 'vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import Select from './Select.vue'
import { formatCount, navigablePages, type CountInput } from '@/utils/count'
import { cn } from '@/utils/cn'

const props = withDefaults(defineProps<{ total: CountInput; pageSizes?: number[] }>(), { pageSizes: () => [10, 20, 50, 100] })
const page = defineModel<number>('page', { required: true })
const pageSize = defineModel<number>('pageSize', { required: true })

/** 页数以 BigInt 精确计算；超过协议页码上限时仅可导航到上限页，total 照常完整展示 */
const nav = computed(() => navigablePages(props.total, pageSize.value))
const pageCount = computed(() => nav.value.pages)

const pages = computed<(number | '…')[]>(() => {
  const n = pageCount.value
  const c = page.value
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const s = Math.max(2, c - 1)
  const e = Math.min(n - 1, c + 1)
  if (s > 2) out.push('…')
  for (let i = s; i <= e; i++) out.push(i)
  if (e < n - 1) out.push('…')
  out.push(n)
  return out
})

const sizeModel = computed({
  get: () => String(pageSize.value),
  set: (v: string) => {
    pageSize.value = Number(v)
    page.value = 1
  },
})

const btn =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 tabular'
</script>

<template>
  <nav class="flex flex-wrap items-center justify-between gap-3 px-1 text-[13px] text-muted-foreground" aria-label="分页">
    <p>
      共 <span class="font-medium text-foreground tabular">{{ formatCount(total) }}</span> 条
      <span v-if="nav.truncated" class="ml-1">（仅可翻至第 {{ formatCount(pageCount) }} 页，请缩小筛选范围）</span>
    </p>
    <div class="flex items-center gap-3">
      <div class="hidden items-center gap-2 sm:flex">
        <span>每页</span>
        <Select
          v-model="sizeModel"
          :options="pageSizes.map((s) => ({ value: String(s), label: `${s} 条` }))"
          class="h-8 w-24"
          aria-label="每页条数"
        />
      </div>
      <div class="flex items-center gap-0.5">
        <button :class="btn" :disabled="page <= 1" aria-label="上一页" @click="page--">
          <ChevronLeft class="size-4" />
        </button>
        <template v-for="(p, i) in pages" :key="`${p}-${i}`">
          <span v-if="p === '…'" class="px-1.5">…</span>
          <button
            v-else
            :class="cn(btn, p === page && 'bg-accent font-medium text-accent-foreground hover:bg-accent')"
            :aria-current="p === page ? 'page' : undefined"
            @click="page = p"
          >
            {{ p }}
          </button>
        </template>
        <button :class="btn" :disabled="page >= pageCount" aria-label="下一页" @click="page++">
          <ChevronRight class="size-4" />
        </button>
      </div>
    </div>
  </nav>
</template>
