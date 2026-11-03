import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/stores/app'

/**
 * ECharts 无法直接读取 CSS 变量，此处在主题切换后解析 Design Token 的计算值，
 * 让图表与浅色/深色主题保持一致。
 */
export function useChartTheme() {
  const { isDark } = storeToRefs(useAppStore())
  const version = ref(0)

  const read = (name: string) => {
    const el = document.createElement('span')
    el.style.color = `var(${name})`
    document.body.appendChild(el)
    const c = getComputedStyle(el).color
    el.remove()
    return c
  }

  watch(isDark, () => nextTick(() => version.value++))

  const colors = computed(() => {
    void version.value
    return {
      chart1: read('--chart-1'),
      chart2: read('--chart-2'),
      chart3: read('--chart-3'),
      chart4: read('--chart-4'),
      chart5: read('--chart-5'),
      success: read('--success'),
      danger: read('--danger'),
      warning: read('--warning'),
      text: read('--muted-foreground'),
      foreground: read('--foreground'),
      border: read('--border'),
      card: read('--popover'),
    }
  })

  const base = computed(() => {
    const c = colors.value
    return {
      textStyle: { fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", sans-serif', color: c.text },
      grid: { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.card,
        borderColor: c.border,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: c.foreground, fontSize: 12 },
        extraCssText: 'border-radius:8px;box-shadow:0 10px 30px -10px rgba(0,0,0,.2);',
        axisPointer: { type: 'line', lineStyle: { color: c.border } },
      },
      xAxis: {
        axisLine: { lineStyle: { color: c.border } },
        axisTick: { show: false },
        axisLabel: { color: c.text, fontSize: 11, margin: 10 },
      },
      yAxis: {
        splitLine: { lineStyle: { color: c.border, type: 'dashed' } },
        axisLabel: { color: c.text, fontSize: 11 },
      },
    }
  })

  return { colors, base }
}
