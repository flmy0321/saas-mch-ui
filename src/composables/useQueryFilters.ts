import { computed, reactive, watch } from 'vue'
import { useRoute, useRouter, type LocationQuery } from 'vue-router'
import type { SortingState } from '@tanstack/vue-table'

type Primitive = string | number

/**
 * 将列表的筛选、分页、排序状态与 URL Query 双向同步，便于刷新与分享。
 * - `draft`：表单正在编辑的筛选值（点击「查询」后才生效）
 * - `applied`：当前 URL 中生效的筛选值
 */
export function useQueryFilters<T extends Record<string, Primitive>>(defaults: T, defaultPageSize = 20) {
  const route = useRoute()
  const router = useRouter()

  const read = (q: LocationQuery): T => {
    const out = { ...defaults }
    for (const k of Object.keys(defaults) as (keyof T)[]) {
      const v = q[k as string]
      if (typeof v === 'string') out[k] = (typeof defaults[k] === 'number' ? Number(v) : v) as T[keyof T]
    }
    return out
  }

  const applied = computed(() => read(route.query))
  const draft = reactive({ ...applied.value }) as T

  const page = computed(() => Math.max(1, Number(route.query.page) || 1))
  const pageSize = computed(() => Number(route.query.pageSize) || defaultPageSize)
  const sorting = computed<SortingState>(() => {
    const s = route.query.sort
    if (typeof s !== 'string' || !s) return []
    const [id, dir] = s.split(':')
    return [{ id: id!, desc: dir !== 'asc' }]
  })

  watch(applied, (v) => Object.assign(draft, v))

  function push(patch: Record<string, Primitive | undefined>) {
    const next: Record<string, string> = {}
    const merged = { ...route.query, ...patch } as Record<string, unknown>
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === '' || v === null) continue
      if (k in defaults && v === (defaults as Record<string, unknown>)[k]) continue
      if (k === 'page' && Number(v) === 1) continue
      if (k === 'pageSize' && Number(v) === defaultPageSize) continue
      next[k] = String(v)
    }
    router.replace({ query: next })
  }

  return {
    draft,
    applied,
    page: computed({ get: () => page.value, set: (v) => push({ page: v }) }),
    pageSize: computed({ get: () => pageSize.value, set: (v) => push({ pageSize: v, page: 1 }) }),
    sorting: computed({
      get: () => sorting.value,
      set: (v: SortingState) => push({ sort: v[0] ? `${v[0].id}:${v[0].desc ? 'desc' : 'asc'}` : undefined, page: 1 }),
    }),
    apply() {
      push({ ...(draft as Record<string, Primitive>), page: 1 })
    },
    reset() {
      Object.assign(draft, defaults)
      router.replace({ query: {} })
    },
    activeCount: computed(() => Object.keys(defaults).filter((k) => applied.value[k] !== defaults[k]).length),
  }
}
