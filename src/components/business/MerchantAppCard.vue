<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ArrowUpRight, Boxes } from '@lucide/vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import OrderNumber from './OrderNumber.vue'
import { APP_ENV } from '@/utils/dictionaries'
import { formatDate } from '@/utils/format'
import type { MerchantApp } from '@/types'

defineProps<{ app: MerchantApp }>()
</script>

<template>
  <article
    class="group relative flex flex-col rounded-xl border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/30"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Boxes class="size-5" aria-hidden="true" />
      </div>
      <div class="flex gap-1.5">
        <StatusBadge :tone="APP_ENV[app.env].tone" :dot="false">{{ APP_ENV[app.env].label }}</StatusBadge>
        <StatusBadge :tone="app.status === 'ACTIVE' ? 'success' : 'neutral'">
          {{ app.status === 'ACTIVE' ? '已启用' : '已停用' }}
        </StatusBadge>
      </div>
    </div>
    <h3 class="mt-4 text-[15px] font-semibold">
      <RouterLink :to="`/developer/apps/${app.appId}`" class="after:absolute after:inset-0 focus-visible:outline-none">
        {{ app.name }}
      </RouterLink>
    </h3>
    <p class="mt-1 line-clamp-2 min-h-10 text-[13px] leading-relaxed text-muted-foreground">{{ app.description }}</p>
    <div class="relative z-[1] mt-4 flex items-center justify-between border-t border-border pt-3.5">
      <OrderNumber :value="app.appId" muted />
      <span class="flex items-center gap-1 text-xs text-muted-foreground">
        创建于 {{ formatDate(app.createdAt) }}
        <ArrowUpRight class="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      </span>
    </div>
  </article>
</template>
