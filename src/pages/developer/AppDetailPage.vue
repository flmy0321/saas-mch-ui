<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, ArrowRight, Check, KeyRound, Webhook, X } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import Button from '@/components/ui/Button.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import DescriptionList from '@/components/ui/DescriptionList.vue'
import { useAsync } from '@/composables/useAsync'
import { api } from '@/services/api'
import { API_KEY_STATUS, API_PERMISSIONS, APP_ENV } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'

const route = useRoute()
const appId = computed(() => String(route.params.appId))
const detail = useAsync(() => api.apps.get(appId.value))
const keys = useAsync(() => api.keys.list(appId.value))
const hook = useAsync(() => api.webhooks.getConfig(appId.value))
const a = computed(() => detail.data.value)

const activeKeys = computed(() => (keys.data.value ?? []).filter((k) => ['ACTIVE', 'EXPIRING', 'PENDING'].includes(k.status)))

const items = computed(() =>
  a.value
    ? [
        { key: 'appId', label: 'AppID', value: a.value.appId },
        { key: 'env', label: '环境', value: APP_ENV[a.value.env].label },
        { key: 'createdAt', label: '创建时间', value: formatDateTime(a.value.createdAt) },
        { key: 'description', label: '应用描述', value: a.value.description },
      ]
    : [],
)
</script>

<template>
  <div class="flex flex-col gap-5">
    <ErrorState v-if="detail.error.value" :message="detail.error.value" class="py-28" @retry="detail.reload()" />
    <template v-else>
      <PageHeader :breadcrumb="[{ label: '应用管理', to: '/developer/apps' }, { label: a?.name ?? '应用详情' }]">
        <template #title>
          <div class="flex flex-wrap items-center gap-3">
            <Button :as="RouterLink" to="/developer/apps" variant="ghost" size="icon" class="size-8" aria-label="返回应用列表">
              <ArrowLeft aria-hidden="true" />
            </Button>
            <h1 v-if="a" class="text-xl font-semibold tracking-tight">{{ a.name }}</h1>
            <Skeleton v-else class="h-7 w-40" />
            <StatusBadge v-if="a" :tone="APP_ENV[a.env].tone">{{ APP_ENV[a.env].label }}</StatusBadge>
            <StatusBadge v-if="a" :tone="a.status === 'ACTIVE' ? 'success' : 'neutral'" dot>
              {{ a.status === 'ACTIVE' ? '已启用' : '已停用' }}
            </StatusBadge>
          </div>
        </template>
      </PageHeader>

      <div class="grid gap-5 xl:grid-cols-3">
        <div class="flex flex-col gap-5 xl:col-span-2">
          <Card title="基本信息">
            <div v-if="!a" class="grid gap-4 sm:grid-cols-2"><Skeleton v-for="i in 4" :key="i" class="h-10" /></div>
            <DescriptionList v-else :items="items" :cols="2">
              <template #appId="{ item }">
                <span class="flex items-center gap-1 font-mono text-[13px]">{{ item.value }}<CopyButton :value="item.value!" label="复制 AppID" /></span>
              </template>
            </DescriptionList>
          </Card>

          <Card title="接口权限" description="权限由平台根据签约产品开通，如需调整请联系客户经理。">
            <ul v-if="a" class="grid gap-2 sm:grid-cols-2">
              <li
                v-for="p in API_PERMISSIONS"
                :key="p.key"
                class="flex items-start gap-3 rounded-lg border border-border p-3"
                :class="a.permissions.includes(p.key) ? '' : 'opacity-60'"
              >
                <span
                  class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
                  :class="a.permissions.includes(p.key) ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'"
                >
                  <Check v-if="a.permissions.includes(p.key)" class="size-3" aria-hidden="true" />
                  <X v-else class="size-3" aria-hidden="true" />
                </span>
                <div>
                  <p class="text-[13px] font-medium">
                    {{ p.label }}
                    <span class="sr-only">{{ a.permissions.includes(p.key) ? '（已开通）' : '（未开通）' }}</span>
                  </p>
                  <p class="font-mono text-xs text-muted-foreground">{{ p.key }}</p>
                </div>
              </li>
            </ul>
            <Skeleton v-else class="h-32" />
          </Card>
        </div>

        <div class="flex flex-col gap-5">
          <Card title="API 密钥">
            <template #actions>
              <Button :as="RouterLink" :to="{ path: '/developer/keys', query: { appId } }" variant="ghost" size="sm">
                管理<ArrowRight aria-hidden="true" />
              </Button>
            </template>
            <Skeleton v-if="!keys.data.value" class="h-20" />
            <div v-else-if="!activeKeys.length" class="flex flex-col items-center gap-2 py-6 text-center">
              <KeyRound class="size-5 text-muted-foreground" aria-hidden="true" />
              <p class="text-[13px] text-muted-foreground">尚未创建可用密钥</p>
            </div>
            <ul v-else class="flex flex-col gap-2">
              <li v-for="k in activeKeys" :key="k.id" class="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2">
                <span class="truncate font-mono text-xs">{{ k.keyId }}</span>
                <StatusBadge :tone="API_KEY_STATUS[k.status].tone" dot>{{ API_KEY_STATUS[k.status].label }}</StatusBadge>
              </li>
            </ul>
          </Card>

          <Card title="Webhook">
            <template #actions>
              <Button :as="RouterLink" :to="{ path: '/developer/webhooks', query: { appId } }" variant="ghost" size="sm">
                配置<ArrowRight aria-hidden="true" />
              </Button>
            </template>
            <Skeleton v-if="!hook.data.value" class="h-16" />
            <div v-else class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <Webhook class="size-4 text-muted-foreground" aria-hidden="true" />
                <StatusBadge :tone="hook.data.value.enabled ? 'success' : 'neutral'" dot>{{ hook.data.value.enabled ? '已启用' : '未启用' }}</StatusBadge>
              </div>
              <p class="break-all font-mono text-xs text-muted-foreground">{{ hook.data.value.url || '未配置回调地址' }}</p>
              <p class="text-xs text-muted-foreground">订阅 {{ hook.data.value.events.length }} 个事件</p>
            </div>
          </Card>
        </div>
      </div>
    </template>
  </div>
</template>
