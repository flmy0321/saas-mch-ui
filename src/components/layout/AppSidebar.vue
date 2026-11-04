<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { ChevronDown, LifeBuoy, PanelLeftClose, PanelLeftOpen } from '@lucide/vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import { NAVIGATION, isLeafActive, type NavGroup } from '@/app/navigation'
import { useAppStore } from '@/stores/app'
import { cn } from '@/utils/cn'

const props = defineProps<{ mobile?: boolean }>()
const route = useRoute()
const { sidebarCollapsed } = storeToRefs(useAppStore())
const collapsed = computed(() => !props.mobile && sidebarCollapsed.value)

const groupActive = (g: NavGroup) => g.children.some((c) => isLeafActive(c, route.path))
const openGroups = ref<Record<string, boolean>>(Object.fromEntries(NAVIGATION.map((g) => [g.label, true])))

watch(
  () => route.path,
  () => {
    for (const g of NAVIGATION) if (groupActive(g)) openGroups.value[g.label] = true
  },
)
</script>

<template>
  <div class="flex h-full flex-col bg-sidebar">
    <div :class="cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-border', collapsed ? 'justify-center px-2' : 'px-4')">
      <div class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true">
          <path d="M5 12h9a4 4 0 0 0 0-8H8v16" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <div v-if="!collapsed" class="min-w-0 leading-tight">
        <p class="text-sm font-semibold tracking-tight">PayHub</p>
        <p class="text-[11px] text-muted-foreground">商户管理后台</p>
      </div>
    </div>

    <nav aria-label="主导航" class="flex-1 overflow-y-auto px-2 py-3">
      <ul class="flex flex-col gap-0.5">
        <li v-for="g in NAVIGATION" :key="g.label">
          <!-- 折叠态：一级图标 + Tooltip，点击进入首个子页面 -->
          <Tooltip v-if="collapsed" :content="g.label" side="right">
            <RouterLink
              :to="g.children[0]!.to"
              :aria-label="g.label"
              :class="
                cn(
                  'mx-auto flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  groupActive(g) && 'bg-accent text-accent-foreground',
                )
              "
            >
              <component :is="g.icon" class="size-[18px]" aria-hidden="true" />
            </RouterLink>
          </Tooltip>
          <template v-else>
            <button
              type="button"
              :aria-expanded="openGroups[g.label]"
              :class="
                cn(
                  'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors hover:bg-muted',
                  groupActive(g) ? 'text-foreground' : 'text-muted-foreground',
                )
              "
              @click="openGroups[g.label] = !openGroups[g.label]"
            >
              <component :is="g.icon" class="size-[18px]" aria-hidden="true" />
              <span class="flex-1 text-left">{{ g.label }}</span>
              <ChevronDown
                :class="cn('size-3.5 opacity-60 transition-transform', !openGroups[g.label] && '-rotate-90')"
                aria-hidden="true"
              />
            </button>
            <ul v-show="openGroups[g.label]" class="mt-0.5 mb-1.5 ml-[21px] flex flex-col gap-0.5 border-l border-border pl-2">
              <li v-for="c in g.children" :key="c.to">
                <RouterLink
                  :to="c.to"
                  :aria-current="isLeafActive(c, route.path) ? 'page' : undefined"
                  :class="
                    cn(
                      'relative flex h-8 items-center rounded-md px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                      isLeafActive(c, route.path) &&
                        'bg-accent font-medium text-accent-foreground before:absolute before:top-1.5 before:bottom-1.5 before:-left-[9px] before:w-px before:bg-primary',
                    )
                  "
                >
                  {{ c.label }}
                </RouterLink>
              </li>
            </ul>
          </template>
        </li>
      </ul>
    </nav>

    <div :class="cn('shrink-0 border-t border-border p-2', collapsed && 'flex flex-col items-center')">
      <a
        v-if="!collapsed"
        href="mailto:support@example.com"
        class="mb-1 flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <LifeBuoy class="size-[18px]" aria-hidden="true" />平台支持
      </a>
      <button
        v-if="!mobile"
        type="button"
        :aria-label="collapsed ? '展开侧边栏' : '折叠侧边栏'"
        :class="
          cn(
            'flex h-9 items-center gap-2.5 rounded-md text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground',
            collapsed ? 'size-9 justify-center' : 'w-full px-2.5',
          )
        "
        @click="sidebarCollapsed = !sidebarCollapsed"
      >
        <PanelLeftOpen v-if="collapsed" class="size-[18px]" aria-hidden="true" />
        <template v-else><PanelLeftClose class="size-[18px]" aria-hidden="true" />折叠导航</template>
      </button>
    </div>
  </div>
</template>
