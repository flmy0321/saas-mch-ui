<script setup lang="ts">
import { computed } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import MerchantAppCard from '@/components/business/MerchantAppCard.vue'
import { useAsync } from '@/composables/useAsync'
import { useAppStore } from '@/stores/app'
import { api } from '@/services/api'

const app = useAppStore()
const list = useAsync(() => api.apps.list())
const sorted = computed(() =>
  [...(list.data.value ?? [])].sort((a, b) => Number(b.env === app.env) - Number(a.env === app.env)),
)
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="应用管理" description="每个应用拥有独立的 AppID、API 密钥与 Webhook 配置，生产与沙箱环境的数据互相隔离。" />

    <div v-if="list.loading.value && !list.data.value" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-44 rounded-xl" />
    </div>
    <ErrorState v-else-if="list.error.value" :message="list.error.value" class="py-20" @retry="list.reload()" />
    <EmptyState v-else-if="!sorted.length" title="暂无应用" description="请联系平台运营开通应用。" class="py-20" />
    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <MerchantAppCard v-for="a in sorted" :key="a.id" :app="a" />
    </div>
  </div>
</template>
