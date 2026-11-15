<script setup lang="ts">
import { computed } from 'vue'
import { Info } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import DescriptionList from '@/components/ui/DescriptionList.vue'
import { useAsync } from '@/composables/useAsync'
import { api } from '@/services/api'
import { merchantStatusMeta } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'

const merchant = useAsync(() => api.account.merchant())
const m = computed(() => merchant.data.value?.merchant ?? null)
const statusMeta = computed(() => merchantStatusMeta(m.value?.status))

const basic = computed(() =>
  m.value
    ? [
        { key: 'merchantNo', label: '商户号', value: m.value.merchantNo },
        { key: 'name', label: '商户名称', value: m.value.name },
        { key: 'status', label: '状态', value: statusMeta.value.label },
        { key: 'createdAt', label: '创建时间', value: formatDateTime(m.value.createdAt) },
      ]
    : [],
)
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="商户信息" description="商户主体信息由平台审核后生效，如需变更请联系客户经理。" />

    <ErrorState v-if="merchant.error.value" :message="merchant.error.value" class="py-20" @retry="merchant.reload()" />
    <div v-else-if="!m" class="flex flex-col gap-5"><Skeleton class="h-24" /><Skeleton class="h-32" /></div>

    <template v-else>
      <Card>
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground" aria-hidden="true">
            {{ m.name.slice(0, 1) }}
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-semibold">{{ m.name }}</h2>
              <StatusBadge :tone="statusMeta.tone" dot>{{ statusMeta.label }}</StatusBadge>
            </div>
            <p class="flex items-center gap-1 font-mono text-[13px] text-muted-foreground">
              {{ m.merchantNo }}<CopyButton :value="m.merchantNo" label="复制商户号" />
            </p>
          </div>
        </div>
      </Card>

      <Card title="基本信息">
        <DescriptionList :items="basic" :cols="2">
          <template #merchantNo="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
        </DescriptionList>
      </Card>

      <p class="flex items-center gap-2 text-xs text-muted-foreground">
        <Info class="size-3.5" aria-hidden="true" />商户信息仅支持查看。主体资质、联系方式与结算账户不在本视图中提供，请登录平台运营后台查看。
      </p>
    </template>
  </div>
</template>
