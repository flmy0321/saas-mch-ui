<script setup lang="ts">
import { ref } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import Card from '@/components/ui/Card.vue'
import CopyButton from '@/components/ui/CopyButton.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'

const sections = [
  { id: 'auth', title: '签名认证' },
  { id: 'create', title: '创建支付' },
  { id: 'refund', title: '申请退款' },
  { id: 'webhook', title: '接收通知' },
  { id: 'errors', title: '错误码' },
]

const lang = ref<'node' | 'curl'>('node')

const snippets = {
  auth: {
    node: `import crypto from 'node:crypto'

const timestamp = Math.floor(Date.now() / 1000).toString()
const nonce = crypto.randomUUID()
const payload = [method, path, timestamp, nonce, body].join('\\n')
const signature = crypto.createHmac('sha256', API_SECRET).update(payload).digest('hex')

headers['Authorization'] = \`PAY-HMAC-SHA256 keyId=\${KEY_ID},ts=\${timestamp},nonce=\${nonce},sign=\${signature}\``,
    curl: `curl -X POST https://api.pay.example.com/v1/payments \\
  -H "Authorization: PAY-HMAC-SHA256 keyId=ak_xxx,ts=1767225600,nonce=...,sign=..." \\
  -H "Content-Type: application/json" \\
  -d @body.json`,
  },
  create: {
    node: `const res = await fetch('https://api.pay.example.com/v1/payments', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: sign(...) },
  body: JSON.stringify({
    appId: 'app_live_8f2a',
    merchantOrderNo: 'ORD202601010001',
    amount: '128.00',         // 单位：元，十进制字符串
    subject: '精品咖啡豆 250g',
    channel: 'WECHAT',
    method: 'QR',
    storeId: 'st_001',
    expireInSeconds: 900,
  }),
})`,
    curl: `curl -X POST https://api.pay.example.com/v1/payments \\
  -H "Authorization: ..." -H "Content-Type: application/json" \\
  -d '{"appId":"app_live_8f2a","merchantOrderNo":"ORD202601010001","amount":"128.00","subject":"精品咖啡豆 250g","channel":"WECHAT","method":"QR"}'`,
  },
  refund: {
    node: `await fetch('https://api.pay.example.com/v1/refunds', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: sign(...) },
  body: JSON.stringify({
    paymentId: 'P20260101000123',
    merchantRefundNo: 'MR20260101000001', // 幂等键
    amount: '32.00',
    reason: '用户申请退货',
  }),
})`,
    curl: `curl -X POST https://api.pay.example.com/v1/refunds \\
  -H "Authorization: ..." -H "Content-Type: application/json" \\
  -d '{"paymentId":"P20260101000123","merchantRefundNo":"MR20260101000001","amount":"32.00","reason":"用户申请退货"}'`,
  },
  webhook: {
    node: `app.post('/webhooks/pay', express.raw({ type: 'application/json' }), (req, res) => {
  const ts = req.header('X-Pay-Timestamp')
  const expected = crypto.createHmac('sha256', API_SECRET).update(\`\${ts}.\${req.body}\`).digest('hex')
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.header('X-Pay-Signature') ?? ''))) {
    return res.status(401).end()
  }
  const event = JSON.parse(req.body)
  // 根据 event.id 幂等处理
  res.status(200).end()
})`,
    curl: `# 通知请求示例
POST /webhooks/pay
X-Pay-Event-Id: evt_01HX...
X-Pay-Timestamp: 1767225600
X-Pay-Signature: 5d41402abc4b2a76b9719d911017c592

{"id":"evt_01HX...","eventType":"PAYMENT.SUCCEEDED","isTest":false,"data":{"paymentId":"P2026...","amount":"128.00"}}`,
  },
} as const

const errors = [
  ['INVALID_SIGNATURE', '401', '签名校验失败，请检查密钥与签名串拼接顺序'],
  ['DUPLICATE_ORDER_NO', '409', '商户订单号重复，请使用新的订单号'],
  ['REFUND_AMOUNT_EXCEEDED', '422', '退款金额超出可退金额'],
  ['PAYMENT_NOT_REFUNDABLE', '422', '订单状态不允许退款'],
  ['RATE_LIMITED', '429', '请求频率超限，请稍后重试'],
  ['CHANNEL_UNAVAILABLE', '503', '支付渠道暂不可用，可稍后重试'],
]
</script>

<template>
  <div class="flex flex-col gap-5">
    <PageHeader title="接入文档" description="服务端通过开放接口创建支付、申请退款，并通过 Webhook 接收结果通知。金额为以元为单位的十进制字符串（如 &quot;128.00&quot;）。签名算法与通知重试策略以核心通知契约为准，当前示例待确认。">
      <template #actions>
        <SegmentedControl v-model="lang" aria-label="示例语言" :options="[{ value: 'node', label: 'Node.js' }, { value: 'curl', label: 'cURL' }]" />
      </template>
    </PageHeader>

    <div class="grid gap-5 lg:grid-cols-[180px_1fr]">
      <nav aria-label="文档目录" class="hidden lg:block">
        <ul class="sticky top-20 flex flex-col gap-0.5 text-[13px]">
          <li v-for="s in sections" :key="s.id">
            <a :href="`#${s.id}`" class="block rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">{{ s.title }}</a>
          </li>
        </ul>
      </nav>

      <div class="flex min-w-0 flex-col gap-5">
        <Card v-for="s in sections.slice(0, 4)" :id="s.id" :key="s.id" :title="s.title" class="scroll-mt-20">
          <p class="mb-3 text-[13px] leading-relaxed text-muted-foreground">
            <template v-if="s.id === 'auth'">每个请求需在 Authorization 头中携带 HMAC-SHA256 签名，时间戳与服务器偏差不得超过 5 分钟。</template>
            <template v-else-if="s.id === 'create'">创建支付订单后返回支付参数，前端据此唤起支付。merchantOrderNo 在同一商户下必须唯一。</template>
            <template v-else-if="s.id === 'refund'">对支付成功的订单发起退款，支持多次部分退款。merchantRefundNo 作为幂等键：同号同参返回已有退款，同号不同参返回 IDEMPOTENCY_CONFLICT。结果未知时请用原编号查询确认，切勿换号重提。</template>
            <template v-else>收到通知后请先校验签名，再返回 HTTP 2xx。处理逻辑应异步执行并按事件 ID 保证幂等；isTest 为 true 的测试推送不应触发业务处理。</template>
          </p>
          <div class="relative overflow-hidden rounded-lg bg-code text-code-foreground">
            <CopyButton :value="snippets[s.id as keyof typeof snippets][lang]" class="absolute right-2 top-2 text-code-foreground/70 hover:bg-white/10 hover:text-code-foreground" />
            <pre class="overflow-x-auto p-4 pr-12 font-mono text-xs leading-relaxed"><code>{{ snippets[s.id as keyof typeof snippets][lang] }}</code></pre>
          </div>
        </Card>

        <Card id="errors" title="错误码" class="scroll-mt-20" body-class="p-0">
          <div class="overflow-x-auto">
            <table class="w-full text-[13px]">
              <thead class="bg-muted/60 text-left text-xs text-muted-foreground">
                <tr>
                  <th scope="col" class="px-5 py-2.5 font-medium">错误码</th>
                  <th scope="col" class="px-5 py-2.5 font-medium">HTTP</th>
                  <th scope="col" class="px-5 py-2.5 font-medium">说明</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr v-for="[code, status, desc] in errors" :key="code">
                  <td class="px-5 py-2.5 font-mono text-xs">{{ code }}</td>
                  <td class="px-5 py-2.5 tabular">{{ status }}</td>
                  <td class="px-5 py-2.5 text-muted-foreground">{{ desc }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>
