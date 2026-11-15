import { computed, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { api } from '@/services/api'
import { appEnvMeta } from '@/utils/dictionaries'
import type { AppView } from '@/types'

const PICKER_PAGE_SIZE = 100

/**
 * 按页累积 App（协议 3.8.3）：
 * - “已加载 N”按 appId 去重后的集合大小计算，不累计原始行数；
 * - total 始终取最新一次响应的服务端值，不从去重结果反推；
 * - 跨页出现重复 appId、total 变化或回写页码与请求不一致时，标记列表已变化并停止续页，
 *   提示重新加载，不宣称已取得同一快照下的全部 App。
 */
export function useAppCollection() {
  const byAppId = shallowRef(new Map<string, AppView>())
  const total = ref<number | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const changed = ref<string | null>(null)
  const exhausted = ref(false)
  let nextPage = 1
  let seq = 0

  async function loadMore() {
    if (loading.value || exhausted.value || changed.value) return
    const id = seq
    const page = nextPage
    loading.value = true
    error.value = null
    try {
      const res = await api.apps.list({ page, pageSize: PICKER_PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' })
      if (id !== seq) return
      if (total.value !== null && res.total !== total.value) changed.value = '加载期间 App 总数发生变化'
      else if (res.page !== page) changed.value = '加载期间列表页码发生变化'
      const next = new Map(byAppId.value)
      for (const a of res.items) {
        if (next.has(a.appId)) changed.value ??= '跨页出现重复 App'
        else next.set(a.appId, a)
      }
      byAppId.value = next
      total.value = res.total
      nextPage = page + 1
      exhausted.value = res.items.length < res.pageSize || page * res.pageSize >= res.total
    } catch (e) {
      if (id === seq) error.value = e instanceof Error ? e.message : '未知错误'
    } finally {
      if (id === seq) loading.value = false
    }
  }

  function reload() {
    seq++
    byAppId.value = new Map()
    total.value = null
    changed.value = null
    exhausted.value = false
    loading.value = false
    nextPage = 1
    return loadMore()
  }

  const items = computed(() => [...byAppId.value.values()])
  const loadedCount = computed(() => byAppId.value.size)
  const hasMore = computed(() => !exhausted.value && !changed.value)

  void loadMore()

  return { items, total, loadedCount, loading, error, changed, hasMore, loadMore, reload }
}

/** 开发者中心页面共用的应用选择：选中值同步到 URL ?appId=，默认选中当前环境下的第一个已加载应用 */
export function useAppPicker() {
  const route = useRoute()
  const router = useRouter()
  const appStore = useAppStore()
  const apps = useAppCollection()

  const options = computed(() =>
    apps.items.value.map((a) => ({ value: a.appId, label: `${a.name}（${appEnvMeta(a.env).label}）` })),
  )

  const appId = computed<string>({
    get: () => (typeof route.query.appId === 'string' ? route.query.appId : ''),
    set: (v) => router.replace({ query: { ...route.query, appId: v || undefined } }),
  })

  const current = computed(() => apps.items.value.find((a) => a.appId === appId.value) ?? null)

  watch(
    () => apps.items.value,
    (list) => {
      if (!list.length || appId.value) return
      appId.value = (list.find((a) => a.env === appStore.env) ?? list[0]).appId
    },
    { immediate: true },
  )

  return { apps, options, appId, current }
}
