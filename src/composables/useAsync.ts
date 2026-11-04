import { ref, shallowRef, watch, type Ref, type WatchSource } from 'vue'

/**
 * 统一的异步数据加载：管理 loading / error / data，并在依赖变化时自动重新请求。
 * 通过请求序号丢弃过期响应，避免快速切换筛选时出现竞态。
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  options: { watch?: WatchSource[] | WatchSource; immediate?: boolean; deep?: boolean } = {},
) {
  const data = shallowRef<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<string | null>(null)
  let seq = 0

  async function run() {
    const id = ++seq
    loading.value = true
    error.value = null
    try {
      const result = await fn()
      if (id === seq) data.value = result
    } catch (e) {
      if (id === seq) error.value = e instanceof Error ? e.message : '未知错误'
    } finally {
      if (id === seq) loading.value = false
    }
  }

  if (options.watch) watch(options.watch, run, { deep: options.deep ?? true })
  if (options.immediate !== false) run()

  return { data, loading, error, reload: run }
}
