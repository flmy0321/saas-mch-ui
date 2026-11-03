<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent, DataZoomComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import type { EChartsCoreOption } from 'echarts/core'

use([CanvasRenderer, BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, DataZoomComponent])

defineProps<{ option: EChartsCoreOption; label: string }>()
</script>

<template>
  <div role="img" :aria-label="label" class="size-full">
    <VChart :option="option" autoresize class="size-full" />
  </div>
</template>
