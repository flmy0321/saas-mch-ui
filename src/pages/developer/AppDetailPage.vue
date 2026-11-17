<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { ArrowLeft, ArrowRight, KeyRound, Webhook } from '@lucide/vue'
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
import { API_KEY_STATUS, appEnvMeta, appStatusMeta } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'

const route = useRoute()
const appId = computed(() => String(route.params.appId))
const detail = useAsync(() => api.apps.get(appId.value))
const keys = useAsync(() => api.keys.list({ appId: appId.value, page: 1, pageSize: 100 }))
const hook = useAsync(() => api.webhooks.getConfig(appId.value))
const hookConfig = computed(() => hook.data.value?.config ?? null)
const a = computed(() => detail.data.value?.app ?? null)
const envMeta = computed(() => appEnvMeta(a.value?.env))
const statusMeta = computed(() => appStatusMeta(a.value?.status))

const activeKeys = computed(() => (keys.data.value?.items ?? []).filter((k) => k.status !== 'REVOKED'))

const items = computed(() =>
  a.value
    ? [
        { key: 'appId', label: 'AppID', value: a.value.appId },
        { key: 'env', label: '环境', value: envMeta.value.label },
        { key: 'createdAt', label: '创建时间', value: formatDateTime(a.value.createdAt) },
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
            <StatusBadge v-if="a" :tone="envMeta.tone">{{ envMeta.label }}</StatusBadge>
            <StatusBadge v-if="a" :tone="statusMeta.tone" dot>{{ statusMeta.label }}</StatusBadge>
          </div>
        </template>
      </PageHeader>

      <div class="grid gap-5 xl:grid-cols-3">
        <div class="flex flex-col gap-5 xl:col-span-2">
          <Card title="基本信息">
            <div v-if="!a" class="grid gap-4 sm:grid-cols-2"><Skeleton v-for="i in 3" :key="i" class="h-10" /></div>
            <DescriptionList v-else :items="items" :cols="2">
              <template #appId="{ item }">
                <span class="flex items-center gap-1 font-mono text-[13px]">{{ item.value }}<CopyButton :value="item.value!" label="复制 AppID" /></span>
              </template>
            </DescriptionList>
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
              <li v-for="k in activeKeys" :key="k.keyId" class="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2">
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
            <p v-if="hook.error.value" class="text-[13px] text-danger" role="alert">{{ hook.error.value }}</p>
            <Skeleton v-else-if="!hookConfig" class="h-16" />
            <div v-else class="flex flex-col gap-2">
              <div class="flex items-center gap-2">
                <Webhook class="size-4 text-muted-foreground" aria-hidden="true" />
                <StatusBadge :tone="hookConfig.enabled ? 'success' : 'neutral'" dot>{{ hookConfig.enabled ? '已启用' : '未启用' }}</StatusBadge>
              </div>
              <p class="break-all font-mono text-xs text-muted-foreground">{{ hookConfig.url ?? '未配置回调地址' }}</p>
            </div>
          </Card>
        </div>
      </div>
    </template>
  </div>
</template>
