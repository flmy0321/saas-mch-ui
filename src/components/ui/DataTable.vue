<script setup lang="ts" generic="TData">
import { computed } from 'vue'
import {
  FlexRender,
  getCoreRowModel,
  useVueTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/vue-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from '@lucide/vue'
import Skeleton from './Skeleton.vue'
import EmptyState from './EmptyState.vue'
import ErrorState from './ErrorState.vue'
import { cn } from '@/utils/cn'

const props = withDefaults(
  defineProps<{
    columns: ColumnDef<TData, any>[]
    data: TData[]
    loading?: boolean
    error?: string | null
    emptyTitle?: string
    emptyDescription?: string
    rowKey?: (row: TData) => string
    skeletonRows?: number
    clickable?: boolean
    columnVisibility?: VisibilityState
  }>(),
  { skeletonRows: 8, columnVisibility: () => ({}) },
)
const sorting = defineModel<SortingState>('sorting', { default: () => [] })
const emit = defineEmits<{ rowClick: [row: TData]; retry: [] }>()

const table = useVueTable({
  get data() {
    return props.data
  },
  get columns() {
    return props.columns
  },
  state: {
    get sorting() {
      return sorting.value
    },
    get columnVisibility() {
      return props.columnVisibility
    },
  },
  manualSorting: true,
  enableSortingRemoval: true,
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  getRowId: props.rowKey ? (row) => props.rowKey!(row) : undefined,
  getCoreRowModel: getCoreRowModel(),
})

const visibleCount = computed(() => table.getVisibleLeafColumns().length)

type Meta = { align?: 'right' | 'center'; class?: string; headerClass?: string }
const metaOf = (m: unknown) => (m ?? {}) as Meta
</script>

<template>
  <div class="relative w-full overflow-x-auto scrollbar-thin">
    <table class="w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr v-for="hg in table.getHeaderGroups()" :key="hg.id">
          <th
            v-for="h in hg.headers"
            :key="h.id"
            scope="col"
            :aria-sort="
              h.column.getIsSorted() === 'asc' ? 'ascending' : h.column.getIsSorted() === 'desc' ? 'descending' : undefined
            "
            :class="
              cn(
                'sticky top-0 h-10 border-b border-border bg-muted/50 px-4 text-left text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-5 last:pr-5',
                metaOf(h.column.columnDef.meta).align === 'right' && 'text-right',
                metaOf(h.column.columnDef.meta).headerClass,
              )
            "
          >
            <button
              v-if="h.column.getCanSort()"
              type="button"
              :class="
                cn(
                  'inline-flex items-center gap-1 rounded hover:text-foreground',
                  metaOf(h.column.columnDef.meta).align === 'right' && 'flex-row-reverse',
                )
              "
              @click="h.column.toggleSorting(undefined)"
            >
              <FlexRender :render="h.column.columnDef.header" :props="h.getContext()" />
              <ArrowUp v-if="h.column.getIsSorted() === 'asc'" class="size-3.5 text-foreground" />
              <ArrowDown v-else-if="h.column.getIsSorted() === 'desc'" class="size-3.5 text-foreground" />
              <ChevronsUpDown v-else class="size-3.5 opacity-50" />
            </button>
            <FlexRender v-else-if="!h.isPlaceholder" :render="h.column.columnDef.header" :props="h.getContext()" />
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-if="loading && !data.length">
          <tr v-for="i in skeletonRows" :key="i">
            <td v-for="c in visibleCount" :key="c" class="h-12 border-b border-border px-4 first:pl-5 last:pr-5">
              <Skeleton :class="c === 1 ? 'h-4 w-40' : 'h-4 w-20'" />
            </td>
          </tr>
        </template>
        <tr v-else-if="error">
          <td :colspan="visibleCount"><ErrorState :message="error" @retry="emit('retry')" /></td>
        </tr>
        <tr v-else-if="!data.length">
          <td :colspan="visibleCount">
            <EmptyState :title="emptyTitle ?? '暂无数据'" :description="emptyDescription">
              <slot name="empty-actions" />
            </EmptyState>
          </td>
        </tr>
        <template v-else>
          <tr
            v-for="row in table.getRowModel().rows"
            :key="row.id"
            :class="cn('group transition-colors hover:bg-muted/40', clickable && 'cursor-pointer', loading && 'opacity-60')"
            @click="clickable && emit('rowClick', row.original)"
          >
            <td
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              :class="
                cn(
                  'h-12 border-b border-border px-4 whitespace-nowrap first:pl-5 last:pr-5',
                  metaOf(cell.column.columnDef.meta).align === 'right' && 'text-right',
                  metaOf(cell.column.columnDef.meta).class,
                )
              "
            >
              <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
