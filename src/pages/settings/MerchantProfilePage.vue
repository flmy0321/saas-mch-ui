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
import { formatDate } from '@/utils/format'

const merchant = useAsync(() => api.account.merchant())
const m = computed(() => merchant.data.value)

const basic = computed(() =>
  m.value
    ? [
        { key: 'merchantNo', label: '商户号', value: m.value.merchantNo },
        { key: 'shortName', label: '商户简称', value: m.value.shortName },
        { key: 'industry', label: '经营类目', value: m.value.industry },
        { key: 'createdAt', label: '入驻时间', value: formatDate(m.value.createdAt) },
      ]
    : [],
)
const legal = computed(() =>
  m.value
    ? [
        { key: 'legalName', label: '主体名称', value: m.value.legalName },
        { key: 'creditCode', label: '统一社会信用代码', value: m.value.creditCode },
        { key: 'address', label: '注册地址', value: m.value.address },
      ]
    : [],
)
const contact = computed(() =>
  m.value
    ? [
        { key: 'contactEmail', label: '联系邮箱', value: m.value.contactEmail },
        { key: 'contactPhone', label: '联系电话', value: m.value.contactPhone },
      ]
    : [],
)
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="商户信息" description="商户主体信息由平台审核后生效，如需变更请联系客户经理。" />

    <ErrorState v-if="merchant.error.value" :message="merchant.error.value" class="py-20" @retry="merchant.reload()" />
    <div v-else-if="!m" class="flex flex-col gap-5"><Skeleton class="h-40" /><Skeleton class="h-32" /></div>

    <template v-else>
      <Card>
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground" aria-hidden="true">
            {{ m.shortName.slice(0, 1) }}
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-semibold">{{ m.name }}</h2>
              <StatusBadge :tone="m.status === 'ACTIVE' ? 'success' : 'warning'" dot>{{ m.status === 'ACTIVE' ? '正常经营' : '交易受限' }}</StatusBadge>
            </div>
            <p class="flex items-center gap-1 font-mono text-[13px] text-muted-foreground">
              {{ m.merchantNo }}<CopyButton :value="m.merchantNo" label="复制商户号" />
            </p>
          </div>
        </div>
      </Card>

      <div class="grid gap-5 xl:grid-cols-2">
        <Card title="基本信息"><DescriptionList :items="basic" :cols="2" /></Card>
        <Card title="联系方式"><DescriptionList :items="contact" :cols="2" /></Card>
      </div>
      <Card title="主体信息">
        <DescriptionList :items="legal" :cols="2">
          <template #creditCode="{ item }"><span class="font-mono text-[13px]">{{ item.value }}</span></template>
        </DescriptionList>
      </Card>

      <p class="flex items-center gap-2 text-xs text-muted-foreground">
        <Info class="size-3.5" aria-hidden="true" />商户信息仅支持查看。结算账户等敏感信息请登录平台运营后台查看。
      </p>
    </template>
  </div>
</template>
