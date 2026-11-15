<script setup lang="ts">
import { computed, ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import Pagination from '@/components/ui/Pagination.vue'
import MerchantAppCard from '@/components/business/MerchantAppCard.vue'
import { useAsync } from '@/composables/useAsync'
import { api } from '@/services/api'
import { formatNumber } from '@/utils/format'

const page = ref(1)
const pageSize = ref(20)
const query = computed(() => ({ page: page.value, pageSize: pageSize.value, sortBy: 'createdAt' as const, sortOrder: 'desc' as const }))
const list = useAsync(
  async () => {
    const res = await api.apps.list(query.value)
    // 超尾页时服务端回写实际页码，与之对齐
    if (res.page !== page.value) page.value = res.page
    return res
  },
  { watch: query },
)
const items = computed(() => list.data.value?.items ?? [])
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="应用管理" description="每个应用拥有独立的 AppID、API 密钥与 Webhook 配置，生产与沙箱环境的数据互相隔离。" />

    <div v-if="list.loading.value && !list.data.value" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-36 rounded-xl" />
    </div>
    <ErrorState v-else-if="list.error.value" :message="list.error.value" class="py-20" @retry="list.reload()" />
    <EmptyState v-else-if="!items.length" title="暂无应用" description="请联系平台运营开通应用。" class="py-20" />
    <template v-else>
      <p class="text-[13px] text-muted-foreground" aria-live="polite">
        共 <span class="font-medium text-foreground tabular">{{ formatNumber(list.data.value?.total ?? 0) }}</span> 个应用，按创建时间倒序
      </p>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MerchantAppCard v-for="a in items" :key="a.appId" :app="a" />
      </div>
      <Pagination v-model:page="page" v-model:page-size="pageSize" :total="list.data.value?.total ?? 0" />
    </template>
  </div>
</template>
