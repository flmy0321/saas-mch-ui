<script setup lang="ts">
import { FileClock } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'

/**
 * 开放 API 接入说明。
 * 请求/响应示例、签名算法、通知信封与错误码必须来自开放 API 自身的权威契约，
 * 不能把商户门户（Portal）字段机械套用到开放 API。权威契约核对前，不提供任何可复制的调用示例。
 */
const sections = [
  {
    id: 'auth',
    title: '签名认证',
    points: ['服务端调用需使用应用密钥签名。', '签名算法、签名串拼接规则与时间戳容差以开放 API 权威契约为准。'],
  },
  {
    id: 'create',
    title: '创建支付',
    points: ['商户订单号在同一商户下应唯一。', '金额以元为单位的十进制字符串表示，不使用整数分。', '支付方式、请求字段与返回结构以开放 API 权威契约为准。'],
  },
  {
    id: 'refund',
    title: '申请退款',
    points: [
      '商户退款编号作为幂等键：同号同参返回已有退款，同号不同参视为幂等冲突。',
      '请求结果未知（超时、断网、服务端返回结果未知）时，请用原编号查询确认，切勿换号重提。',
      '查询不到不代表未受理；长时间无法确认时请联系客服。',
    ],
  },
  {
    id: 'webhook',
    title: '接收通知',
    points: [
      '收到通知后先校验签名，再返回 HTTP 2xx；业务处理应异步执行，并按事件 ID 保证幂等。',
      '事件类型、信封字段、签名头与重试策略以核心通知契约为准。',
      '测试推送（isTest 为 true）不应触发业务处理。',
    ],
  },
  {
    id: 'errors',
    title: '错误码',
    points: ['错误码、HTTP 状态与结果确定性语义以开放 API 权威契约为准，此处暂不列出。'],
  },
]
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader
      title="接入文档"
      description="服务端通过开放接口创建支付、申请退款，并通过 Webhook 接收结果通知。"
    />

    <div
      role="note"
      class="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] leading-relaxed"
    >
      <FileClock class="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <p class="text-pretty">
        开放 API 权威契约尚在核对中。为避免按未确认的字段、签名或错误码接入，本页暂不提供可复制的调用示例，仅列出已确认的接入原则。正式示例将在契约核对后发布。
      </p>
    </div>

    <div class="grid gap-5 lg:grid-cols-[180px_1fr]">
      <nav aria-label="文档目录" class="hidden lg:block">
        <ul class="sticky top-20 flex flex-col gap-0.5 text-[13px]">
          <li v-for="s in sections" :key="s.id">
            <a :href="`#${s.id}`" class="block rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">{{ s.title }}</a>
          </li>
        </ul>
      </nav>

      <div class="flex min-w-0 flex-col gap-5">
        <Card v-for="s in sections" :id="s.id" :key="s.id" :title="s.title" class="scroll-mt-20">
          <ul class="flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-muted-foreground">
            <li v-for="(pt, i) in s.points" :key="i" class="text-pretty">{{ pt }}</li>
          </ul>
        </Card>
      </div>
    </div>
  </div>
</template>
