import { computed, type Ref } from 'vue'
import { useChartTheme } from './useChartTheme'
import { channelMeta } from '@/utils/dictionaries'
import { formatNumber, formatPercent } from '@/utils/format'
import { amountToChartNumber, formatMoney } from '@/utils/money'
import type { AmountDecimal, ChannelShare } from '@/types'

export interface SeriesPoint {
  label: string
  successAmount: AmountDecimal
  refundAmount: AmountDecimal
  successCount: number
  successRate: number
}

type TooltipParam = { axisValueLabel: string; marker: string; seriesName: string; value: number; dataIndex: number; seriesIndex: number }

const row = (p: TooltipParam, value: string) =>
  `<div style="display:flex;gap:16px;justify-content:space-between;align-items:center;margin-top:4px">
    <span>${p.marker}${p.seriesName}</span><b style="font-variant-numeric:tabular-nums">${value}</b></div>`

/** 交易类图表的统一配置，确保工作台、统计页、门店详情的图表外观一致 */
export function useTradeCharts() {
  const { colors, base } = useChartTheme()

  const yuanAxisLabel = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(v >= 100000 ? 0 : 1)}万` : String(v))

  function amountTrend(points: Ref<SeriesPoint[]>, metric: Ref<'amount' | 'count'>) {
    return computed(() => {
      const c = colors.value
      const isAmount = metric.value === 'amount'
      return {
        ...base.value,
        tooltip: {
          ...base.value.tooltip,
          formatter: (ps: TooltipParam[]) =>
            `<div style="font-size:12px"><div style="opacity:.7">${ps[0]?.axisValueLabel}</div>${ps
              .map((p) => row(p, isAmount ? formatMoney(points.value[p.dataIndex]?.successAmount) : `${formatNumber(p.value)} 笔`))
              .join('')}</div>`,
        },
        xAxis: { ...base.value.xAxis, type: 'category', boundaryGap: false, data: points.value.map((p) => p.label) },
        yAxis: {
          ...base.value.yAxis,
          type: 'value',
          axisLabel: { ...base.value.yAxis.axisLabel, formatter: isAmount ? yuanAxisLabel : undefined },
        },
        series: [
          {
            name: isAmount ? '成功交易金额' : '成功交易笔数',
            type: 'line',
            smooth: 0.3,
            symbol: 'circle',
            symbolSize: 6,
            showSymbol: points.value.length <= 14,
            lineStyle: { width: 2, color: c.chart1 },
            itemStyle: { color: c.chart1 },
            areaStyle: { color: c.chart1, opacity: 0.08 },
            data: points.value.map((p) => (isAmount ? amountToChartNumber(p.successAmount) : p.successCount)),
          },
        ],
      }
    })
  }

  function successRate(points: Ref<SeriesPoint[]>) {
    return computed(() => {
      const c = colors.value
      const rates = points.value.map((p) => +(p.successRate * 100).toFixed(2))
      const min = rates.length ? Math.max(0, Math.floor(Math.min(...rates) - 3)) : 0
      return {
        ...base.value,
        tooltip: {
          ...base.value.tooltip,
          formatter: (ps: TooltipParam[]) =>
            `<div style="font-size:12px"><div style="opacity:.7">${ps[0]?.axisValueLabel}</div>${ps
              .map((p) => row(p, formatPercent(p.value / 100)))
              .join('')}</div>`,
        },
        xAxis: { ...base.value.xAxis, type: 'category', boundaryGap: false, data: points.value.map((p) => p.label) },
        yAxis: {
          ...base.value.yAxis,
          type: 'value',
          min,
          max: 100,
          axisLabel: { ...base.value.yAxis.axisLabel, formatter: '{value}%' },
        },
        series: [
          {
            name: '支付成功率',
            type: 'line',
            smooth: 0.3,
            showSymbol: false,
            lineStyle: { width: 2, color: c.success },
            itemStyle: { color: c.success },
            data: rates,
          },
        ],
      }
    })
  }

  function payVsRefund(points: Ref<SeriesPoint[]>) {
    return computed(() => {
      const c = colors.value
      return {
        ...base.value,
        legend: { show: false },
        tooltip: {
          ...base.value.tooltip,
          axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(127,127,127,0.06)' } },
          formatter: (ps: TooltipParam[]) =>
            `<div style="font-size:12px"><div style="opacity:.7">${ps[0]?.axisValueLabel}</div>${ps
              .map((p) => row(p, formatMoney(p.seriesIndex === 0 ? points.value[p.dataIndex]?.successAmount : points.value[p.dataIndex]?.refundAmount)))
              .join('')}</div>`,
        },
        xAxis: { ...base.value.xAxis, type: 'category', data: points.value.map((p) => p.label) },
        yAxis: {
          ...base.value.yAxis,
          type: 'value',
          axisLabel: { ...base.value.yAxis.axisLabel, formatter: yuanAxisLabel },
        },
        series: [
          {
            name: '支付金额',
            type: 'bar',
            barMaxWidth: 14,
            barGap: '30%',
            itemStyle: { color: c.chart1, borderRadius: [3, 3, 0, 0] },
            data: points.value.map((p) => amountToChartNumber(p.successAmount)),
          },
          {
            name: '退款金额',
            type: 'bar',
            barMaxWidth: 14,
            itemStyle: { color: c.chart4, borderRadius: [3, 3, 0, 0] },
            data: points.value.map((p) => amountToChartNumber(p.refundAmount)),
          },
        ],
      }
    })
  }

  function channelDonut(shares: Ref<ChannelShare[]>) {
    return computed(() => {
      const c = colors.value
      const palette: Record<string, string> = { ALIPAY: c.chart1, WECHAT: c.chart2, UNIONPAY: c.chart3 }
      return {
        textStyle: base.value.textStyle,
        tooltip: {
          ...base.value.tooltip,
          trigger: 'item',
          formatter: (p: { marker: string; name: string; value: number; percent: number; dataIndex: number }) =>
            `<div style="font-size:12px">${p.marker}${p.name}<div style="margin-top:4px;font-variant-numeric:tabular-nums"><b>${formatMoney(shares.value[p.dataIndex]?.amount)}</b> · ${p.percent.toFixed(1)}%</div></div>`,
        },
        series: [
          {
            type: 'pie',
            radius: ['62%', '86%'],
            center: ['50%', '50%'],
            avoidLabelOverlap: true,
            padAngle: 2,
            itemStyle: { borderRadius: 4, borderColor: c.card, borderWidth: 2 },
            label: { show: false },
            emphasis: { scale: true, scaleSize: 4 },
            data: shares.value.map((s) => ({
              name: channelMeta(s.channel).label,
              value: amountToChartNumber(s.amount),
              itemStyle: { color: palette[s.channel] },
            })),
          },
        ],
      }
    })
  }

  return { colors, amountTrend, successRate, payVsRefund, channelDonut }
}
