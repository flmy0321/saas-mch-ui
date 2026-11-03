<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { ChevronsUpDown, LogOut, Menu, Moon, Search, Settings, ShieldCheck, Sun, UserRound, WifiOff } from '@lucide/vue'
import Button from '@/components/ui/Button.vue'
import Tooltip from '@/components/ui/Tooltip.vue'
import DropdownMenu from '@/components/ui/DropdownMenu.vue'
import DropdownItem from '@/components/ui/DropdownItem.vue'
import Switch from '@/components/ui/Switch.vue'
import NotificationMenu from './NotificationMenu.vue'
import { useAppStore } from '@/stores/app'
import { useSessionStore } from '@/stores/session'
import { cn } from '@/utils/cn'

const app = useAppStore()
const { isDark, env, simulateNetworkError, searchOpen, mobileNavOpen } = storeToRefs(app)
const session = useSessionStore()
const { user, merchant } = storeToRefs(session)
const router = useRouter()

async function logout() {
  try {
    await session.logout()
  } catch {
    // 服务端注销失败不影响本地退出，token 已在 finally 中清除
  }
  toast.success('已退出登录')
  router.replace('/login')
}

const initials = computed(() => user.value?.name.slice(-2) ?? '')

function switchEnv(next: 'production' | 'sandbox') {
  if (env.value === next) return
  env.value = next
  toast.success(`已切换至${next === 'production' ? '生产' : '沙箱'}环境`, {
    description: '演示环境中数据保持一致，仅标识发生变化',
  })
}
</script>

<template>
  <header class="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur sm:px-5">
    <Button variant="ghost" size="icon-sm" class="lg:hidden" aria-label="打开导航" @click="mobileNavOpen = true">
      <Menu aria-hidden="true" />
    </Button>

    <!-- 商户与环境 -->
    <DropdownMenu align="start" class="w-64">
      <template #trigger>
        <button
          type="button"
          class="flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <span class="hidden size-6 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold sm:flex">
            {{ merchant?.shortName.slice(0, 1) }}
          </span>
          <span class="max-w-[42vw] truncate text-[13px] font-medium sm:max-w-56">{{ merchant?.name ?? '加载中…' }}</span>
          <span
            :class="
              cn(
                'inline-flex h-5 items-center gap-1 rounded px-1.5 text-[11px] font-medium whitespace-nowrap',
                env === 'production' ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning',
              )
            "
          >
            <span :class="cn('size-1.5 rounded-full', env === 'production' ? 'bg-success' : 'bg-warning')" />
            {{ env === 'production' ? '生产' : '沙箱' }}
          </span>
          <ChevronsUpDown class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </template>
      <div class="px-2 py-1.5">
        <p class="text-xs text-muted-foreground">商户编号</p>
        <p class="font-mono text-xs">{{ merchant?.merchantNo }}</p>
      </div>
      <div class="my-1 h-px bg-border" />
      <p class="px-2 pt-1 pb-1 text-xs text-muted-foreground">切换环境</p>
      <DropdownItem @select="switchEnv('production')">
        <span class="size-2 rounded-full bg-success" />生产环境
        <span v-if="env === 'production'" class="ml-auto text-xs text-primary">当前</span>
      </DropdownItem>
      <DropdownItem @select="switchEnv('sandbox')">
        <span class="size-2 rounded-full bg-warning" />沙箱环境
        <span v-if="env === 'sandbox'" class="ml-auto text-xs text-primary">当前</span>
      </DropdownItem>
    </DropdownMenu>

    <div class="flex-1" />

    <button
      type="button"
      class="hidden h-8 w-64 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-[13px] text-muted-foreground shadow-card transition-colors hover:border-input md:flex"
      @click="searchOpen = true"
    >
      <Search class="size-3.5" aria-hidden="true" />
      <span class="flex-1 text-left">搜索订单、退款、门店</span>
      <kbd class="rounded border border-border px-1 font-mono text-[10px]">⌘K</kbd>
    </button>
    <Button variant="ghost" size="icon-sm" class="md:hidden" aria-label="搜索" @click="searchOpen = true">
      <Search aria-hidden="true" />
    </Button>

    <Tooltip :content="isDark ? '切换为浅色主题' : '切换为深色主题'" side="bottom">
      <Button variant="ghost" size="icon-sm" :aria-label="isDark ? '切换为浅色主题' : '切换为深色主题'" @click="app.toggleTheme()">
        <Sun v-if="isDark" aria-hidden="true" />
        <Moon v-else aria-hidden="true" />
      </Button>
    </Tooltip>

    <NotificationMenu />

    <DropdownMenu class="w-60">
      <template #trigger>
        <button
          type="button"
          aria-label="用户菜单"
          class="ml-1 flex size-8 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          {{ initials }}
        </button>
      </template>
      <div class="px-2 py-1.5">
        <p class="text-sm font-medium">{{ user?.name }}</p>
        <p class="truncate text-xs text-muted-foreground">{{ user?.email }}</p>
      </div>
      <div class="my-1 h-px bg-border" />
      <DropdownItem @select="router.push('/settings/profile')"><UserRound />个人设置</DropdownItem>
      <DropdownItem @select="router.push('/settings/security')"><ShieldCheck />安全设置</DropdownItem>
      <DropdownItem @select="router.push('/settings/merchant')"><Settings />商户资料</DropdownItem>
      <div class="my-1 h-px bg-border" />
      <label class="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] hover:bg-muted" @click.stop>
        <WifiOff class="size-4 text-muted-foreground" aria-hidden="true" />
        <span class="flex-1">模拟网络异常</span>
        <Switch v-model="simulateNetworkError" aria-label="模拟网络异常" />
      </label>
      <div class="my-1 h-px bg-border" />
      <DropdownItem danger @select="logout"><LogOut />退出登录</DropdownItem>
    </DropdownMenu>
  </header>
</template>
