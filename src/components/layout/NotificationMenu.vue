<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { Bell, CheckCheck } from '@lucide/vue'
import { toast } from 'vue-sonner'
import Popover from '@/components/ui/Popover.vue'
import Button from '@/components/ui/Button.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useSessionStore } from '@/stores/session'
import { formatRelative } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { Notification } from '@/types'

const session = useSessionStore()
const { notifications, unreadCount } = storeToRefs(session)
const router = useRouter()
const open = ref(false)

const levelClass: Record<Notification['level'], string> = {
  info: 'bg-info',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

async function markAll() {
  try {
    await session.markAllRead()
    toast.success('已全部标记为已读')
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '操作失败')
  }
}

function openItem(n: Notification) {
  n.read = true
  open.value = false
  if (n.link) router.push(n.link)
}
</script>

<template>
  <Popover v-model:open="open" align="end" class="w-[360px] p-0">
    <template #trigger>
      <Button variant="ghost" size="icon-sm" :aria-label="`消息通知，${unreadCount} 条未读`" class="relative">
        <Bell aria-hidden="true" />
        <span
          v-if="unreadCount"
          class="absolute top-1 right-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold text-white tabular"
        >
          {{ unreadCount }}
        </span>
      </Button>
    </template>
    <div class="flex items-center justify-between border-b border-border px-4 py-3">
      <p class="text-sm font-semibold">消息通知</p>
      <Button v-if="unreadCount" variant="ghost" size="sm" class="h-7 px-2" @click="markAll">
        <CheckCheck aria-hidden="true" />全部已读
      </Button>
    </div>
    <ul v-if="notifications.length" class="max-h-96 overflow-y-auto py-1">
      <li v-for="n in notifications" :key="n.id">
        <button type="button" class="flex w-full gap-3 px-4 py-3 text-left hover:bg-muted" @click="openItem(n)">
          <span :class="cn('mt-1.5 size-1.5 shrink-0 rounded-full', n.read ? 'bg-transparent' : levelClass[n.level])" />
          <span class="min-w-0 flex-1">
            <span :class="cn('block text-[13px]', !n.read && 'font-medium')">{{ n.title }}</span>
            <span class="mt-0.5 line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{{ n.description }}</span>
            <span class="mt-1 block text-[11px] text-muted-foreground">{{ formatRelative(n.createdAt) }}</span>
          </span>
        </button>
      </li>
    </ul>
    <EmptyState v-else :icon="Bell" title="暂无消息" class="py-10" />
  </Popover>
</template>
