/**
 * 内存 Mock 数据库。
 * 使用固定种子的伪随机数生成，保证同一天内数据稳定且业务关联一致：
 * 支付订单的已退款/退款中金额始终由退款记录汇总得出，Webhook 记录始终指向真实存在的订单或退款。
 */
import type {
  ApiKey,
  CurrentUser,
  LoginSession,
  Merchant,
  MerchantApp,
  Notification,
  Payment,
  PaymentChannel,
  PaymentMethod,
  PaymentStatus,
  Refund,
  RefundProgressEvent,
  RefundStatus,
  Store,
  WebhookAttempt,
  WebhookConfig,
  WebhookDelivery,
  WebhookDeliveryStatus,
  WebhookEventType,
} from '@/types'

type PaymentAmountKeys =
  | 'amount'
  | 'paidAmount'
  | 'refundedAmount'
  | 'refundingAmount'
  | 'refundPrincipalLimit'
  | 'availableRefundAmount'

/** Mock 内部行：金额以 BigInt 分保存，仅在接口边界转换为 AmountDecimal 字符串 */
export interface PaymentRow extends Omit<Payment, PaymentAmountKeys> {
  amount: bigint
  paidAmount: bigint | null
  refundedAmount: bigint
  refundingAmount: bigint
  refundPrincipalLimit: bigint | null
  availableRefundAmount: bigint | null
  /** 幂等作用域（Mock 以应用划分），不暴露给网页 */
  scope: string
  /** 固定演示数据：不由 recomputePayment 覆盖退款资格字段 */
  pinnedEligibility?: boolean
}

export interface RefundRow extends Omit<Refund, 'amount'> {
  amount: bigint
  scope: string
}

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20261102)
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!
function weighted<T>(entries: [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [v, w] of entries) {
    r -= w
    if (r <= 0) return v
  }
  return entries[entries.length - 1]![0]
}

const pad = (n: number, l = 2) => String(n).padStart(l, '0')
const stamp = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
const iso = (ms: number) => new Date(ms).toISOString()

export const NOW = (() => {
  const d = new Date()
  d.setSeconds(0, 0)
  return d.getTime()
})()

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const PAY_EXPIRE = 30 * MIN

/** 协议规定统计日界为 Asia/Shanghai（UTC+8，无夏令时），不随浏览器本地时区变化 */
export const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
/** 把时间戳平移到上海墙钟，便于用 UTC getter 读取上海日期/星期 */
export const toShanghaiWall = (ms: number) => new Date(ms + SHANGHAI_OFFSET_MS)

export function startOfDay(ms: number) {
  const day = 24 * 60 * 60 * 1000
  return Math.floor((ms + SHANGHAI_OFFSET_MS) / day) * day - SHANGHAI_OFFSET_MS
}

/* ------------------------------------------------------------------ */
/* 商户、用户                                                           */
/* ------------------------------------------------------------------ */

export const merchant: Merchant = {
  merchantNo: 'M10008812',
  name: '杭州云栖优选零售有限公司',
  shortName: '云栖优选',
  status: 'ACTIVE',
  legalName: '杭州云栖优选零售有限公司',
  creditCode: '91330106MA2****7XK',
  industry: '零售 / 便利店',
  contactEmail: 'finance@yunqi-mart.example',
  contactPhone: '0571-8****6622',
  address: '浙江省杭州市西湖区文三路 398 号',
  createdAt: iso(NOW - 420 * DAY),
}

export const currentUser: CurrentUser = {
  id: 'U20001',
  name: '林知夏',
  email: 'zhixia.lin@yunqi-mart.example',
  phone: '138****5216',
  role: '商户管理员',
  lastLoginAt: iso(NOW - 25 * MIN),
  lastLoginIp: '115.236.**.**',
}

export const sessions: LoginSession[] = [
  {
    id: 'S1',
    device: 'macOS',
    browser: 'Chrome 142',
    ip: '115.236.**.**',
    location: '浙江 杭州',
    lastActiveAt: iso(NOW - 1 * MIN),
    current: true,
  },
  {
    id: 'S2',
    device: 'Windows',
    browser: 'Edge 141',
    ip: '183.129.**.**',
    location: '浙江 杭州',
    lastActiveAt: iso(NOW - 2 * DAY - 3 * HOUR),
    current: false,
  },
  {
    id: 'S3',
    device: 'iOS',
    browser: 'Safari',
    ip: '223.104.**.**',
    location: '上海',
    lastActiveAt: iso(NOW - 6 * DAY),
    current: false,
  },
]

/* ------------------------------------------------------------------ */
/* 门店                                                                 */
/* ------------------------------------------------------------------ */

const STORE_SEEDS = [
  { name: '西湖文三路店', address: '杭州市西湖区文三路 398 号', contact: '陈思远' },
  { name: '滨江星光大道店', address: '杭州市滨江区星光大道 228 号', contact: '王一鸣' },
  { name: '上城湖滨银泰店', address: '杭州市上城区延安路 258 号', contact: '赵晓楠' },
  { name: '余杭未来科技城店', address: '杭州市余杭区文一西路 1818 号', contact: '刘子墨' },
  { name: '拱墅运河天地店', address: '杭州市拱墅区丽水路 58 号', contact: '孙佳怡' },
  { name: '萧山机场 T4 店', address: '杭州市萧山区萧山国际机场 T4 航站楼', contact: '周可欣' },
]

export const stores: Store[] = STORE_SEEDS.map((s, i) => ({
  id: `st_${i + 1}`,
  storeNo: `S${merchant.merchantNo.slice(1)}${pad(i + 1, 3)}`,
  merchantStoreNo: `YQ-HZ-${pad(i + 1, 3)}`,
  name: s.name,
  status: i === 5 ? 'DISABLED' : 'ACTIVE',
  address: s.address,
  contactName: s.contact,
  contactPhone: `1${int(30, 89)}****${pad(int(0, 9999), 4)}`,
  createdAt: iso(NOW - (400 - i * 45) * DAY),
}))

const STORE_WEIGHTS: [string, number][] = [
  ['st_1', 30],
  ['st_2', 22],
  ['st_3', 20],
  ['st_4', 14],
  ['st_5', 10],
  ['st_6', 4],
]

/* ------------------------------------------------------------------ */
/* 支付订单                                                             */
/* ------------------------------------------------------------------ */

const SUBJECTS = ['便利店商品', '鲜食套餐', '咖啡饮品', '日用百货', '烘焙面包', '会员充值商品', '生鲜水果', '零食组合']
const METHODS: Partial<Record<PaymentChannel, [PaymentMethod, number][]>> = {
  WECHAT: [
    ['MERCHANT_SCAN', 40],
    ['MINI_PROGRAM', 30],
    ['OFFICIAL_ACCOUNT', 15],
    ['QR', 10],
    ['SDK', 5],
  ],
  ALIPAY: [
    ['MERCHANT_SCAN', 45],
    ['QR', 20],
    ['H5', 15],
    ['SDK', 12],
    ['MINI_PROGRAM', 8],
  ],
  UNIONPAY: [
    ['MERCHANT_SCAN', 60],
    ['QR', 30],
    ['SDK', 10],
  ],
}
const FAIL_REASONS = ['用户余额不足', '用户取消支付', '支付渠道风控拦截', '银行卡状态异常']
const APP_SCOPES = ['app_9f3c2a71d40e8b15', 'app_51be07c6a92f3d48']

function randomAmount(): bigint {
  const yuan = Math.exp(Math.log(6) + rand() * (Math.log(1800) - Math.log(6)))
  const fen = Math.round(yuan * 100)
  return BigInt(Math.max(100, Math.round(fen / 10) * 10))
}

function businessTime(dayStart: number): number {
  const hour = weighted<number>([
    [7, 3],
    [8, 6],
    [9, 6],
    [10, 6],
    [11, 9],
    [12, 11],
    [13, 8],
    [14, 6],
    [15, 6],
    [16, 6],
    [17, 8],
    [18, 10],
    [19, 9],
    [20, 7],
    [21, 5],
    [22, 3],
  ])
  return dayStart + hour * HOUR + int(0, 59) * MIN + int(0, 59) * 1000
}

export const payments: PaymentRow[] = []
export const refunds: RefundRow[] = []
export const webhookDeliveries: WebhookDelivery[] = []

let orderSeq = 1

function createPayment(createdMs: number): PaymentRow {
  const age = NOW - createdMs
  const channel = weighted<PaymentChannel>([
    ['WECHAT', 52],
    ['ALIPAY', 40],
    ['UNIONPAY', 8],
  ])
  const method = weighted(METHODS[channel] ?? [['QR', 1]])
  const amount = randomAmount()
  const storeId = weighted(STORE_WEIGHTS)
  const store = stores.find((s) => s.id === storeId)!
  const status: PaymentStatus =
    age < PAY_EXPIRE
      ? weighted<PaymentStatus>([
          ['SUCCESS', 55],
          ['PAYING', 33],
          ['CREATED', 6],
          ['CLOSING', 6],
        ])
      : weighted<PaymentStatus>([
          ['SUCCESS', 89],
          ['CLOSED', 7],
          ['FAILED', 4],
        ])

  const seq = orderSeq++
  const d = new Date(createdMs)
  const submittedMs = status === 'CREATED' ? null : createdMs + int(1, 4) * 1000
  const paidMs = status === 'SUCCESS' ? Math.min(createdMs + int(6, 150) * 1000, NOW) : null
  const failedMs = status === 'FAILED' ? createdMs + int(20, 600) * 1000 : null

  return {
    id: `P${stamp(d)}${pad(seq % 100000, 5)}`,
    source: 'API',
    scope: weighted<string>([
      [APP_SCOPES[0]!, 80],
      [APP_SCOPES[1]!, 20],
    ]),
    merchantOrderNo: `SO${stamp(d).slice(2)}${pad(int(0, 9999), 4)}`,
    storeId,
    storeName: store.name,
    subject: pick(SUBJECTS),
    amount,
    paidAmount: status === 'SUCCESS' ? amount : null,
    channel,
    method,
    status,
    coreStatus: status,
    createdAt: iso(createdMs),
    submittedAt: submittedMs ? iso(submittedMs) : null,
    paidAt: paidMs ? iso(paidMs) : null,
    closedAt: status === 'CLOSED' ? iso(createdMs + PAY_EXPIRE) : null,
    failedAt: failedMs ? iso(failedMs) : null,
    failReason: status === 'FAILED' ? pick(FAIL_REASONS) : null,
    expireAt: iso(createdMs + PAY_EXPIRE),
    refundedAmount: 0n,
    refundingAmount: 0n,
    refundAggregate: 'NONE',
    refundCount: 0,
    refundPrincipalLimit: null,
    availableRefundAmount: null,
    refundEligibility: null,
    collectionVerification: null,
  }
}

const DAYS = 75
for (let offset = DAYS - 1; offset >= 0; offset--) {
  const dayStart = startOfDay(NOW - offset * DAY)
  const weekday = toShanghaiWall(dayStart).getUTCDay()
  const base = weekday === 0 || weekday === 6 ? 150 : 118
  const trend = 1 + (DAYS - offset) * 0.003
  const count = Math.round(base * trend * (0.82 + rand() * 0.36))
  for (let i = 0; i < count; i++) {
    const t = businessTime(dayStart)
    if (t > NOW) continue
    payments.push(createPayment(t))
  }
}
payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

/* ------------------------------------------------------------------ */
/* 退款                                                                 */
/* ------------------------------------------------------------------ */

const REFUND_REASONS = ['商品质量问题', '用户取消订单', '重复支付', '商品缺货', '价格调整差额退还', '顾客不满意退货']
let refundSeq = 1

function progressFor(status: RefundStatus, createdMs: number, finishedMs: number | null): RefundProgressEvent[] {
  const ev: RefundProgressEvent[] = [{ status: 'CREATED', at: iso(createdMs), note: '退款申请已受理' }]
  if (status === 'CREATED') return ev
  ev.push({ status: 'PROCESSING', at: iso(createdMs + int(2, 20) * 1000), note: '已提交至支付渠道处理' })
  if (status === 'PROCESSING') return ev
  if (status === 'SUSPENDED') {
    ev.push({ status: 'SUSPENDED', at: iso(createdMs + int(1, 6) * HOUR), note: '退款异常处理中，请稍后查询或联系平台支持。' })
    return ev
  }
  const notes: Partial<Record<RefundStatus, string>> = {
    SUCCESS: '退款已原路退回至用户支付账户',
    FAILED: '退款失败',
    CLOSED: '退款已关闭',
  }
  ev.push({ status, at: iso(finishedMs!), note: notes[status] })
  return ev
}

export function buildRefund(p: PaymentRow, amount: bigint, createdMs: number, status: RefundStatus, reason: string): RefundRow {
  const finishedMs =
    status === 'SUCCESS' || status === 'FAILED' || status === 'CLOSED'
      ? Math.min(createdMs + int(30, 3 * 3600) * 1000, NOW)
      : null
  const progress = progressFor(status, createdMs, finishedMs)
  const d = new Date(createdMs)
  const seq = refundSeq++
  return {
    id: `R${stamp(d)}${pad(seq % 100000, 5)}`,
    merchantRefundNo: `MR${stamp(d).slice(2)}${pad(int(0, 999), 3)}`,
    paymentId: p.id,
    scope: p.scope,
    merchantOrderNo: p.merchantOrderNo,
    storeId: p.storeId,
    storeName: p.storeName,
    channel: p.channel,
    amount,
    status,
    reason,
    createdAt: iso(createdMs),
    updatedAt: progress[progress.length - 1]!.at,
    finishedAt: finishedMs ? iso(finishedMs) : null,
    failReason: status === 'FAILED' ? '渠道返回：原交易账户状态异常' : null,
    progress,
  }
}

function refundStatusFor(createdMs: number): RefundStatus {
  const age = NOW - createdMs
  if (age < 3 * MIN) return weighted<RefundStatus>([['CREATED', 1], ['PROCESSING', 2]])
  if (age < 40 * MIN) return weighted<RefundStatus>([['PROCESSING', 3], ['SUCCESS', 7]])
  return weighted<RefundStatus>([
    ['SUCCESS', 86],
    ['FAILED', 5],
    ['CLOSED', 4],
    ['SUSPENDED', age < 4 * DAY ? 5 : 0],
  ])
}

export const COUNTED_REFUND: RefundStatus[] = ['CREATED', 'PROCESSING', 'SUSPENDED', 'SUCCESS']

for (const p of payments) {
  if (p.status !== 'SUCCESS' || !p.paidAt) continue
  const paidMs = new Date(p.paidAt).getTime()
  if (NOW - paidMs < 8 * MIN) continue
  if (rand() > 0.085) continue

  const plan = weighted<'full' | 'partial' | 'double'>([
    ['full', 45],
    ['partial', 40],
    ['double', 15],
  ])
  const window = Math.min(NOW - paidMs, 5 * DAY)
  const firstMs = paidMs + Math.floor(rand() * window * 0.6) + MIN
  const total = Number(p.amount)
  const amounts = (
    plan === 'full'
      ? [total]
      : plan === 'partial'
        ? [Math.max(100, Math.round((total * (0.15 + rand() * 0.5)) / 10) * 10)]
        : [Math.round((total * 0.3) / 10) * 10, Math.round((total * 0.25) / 10) * 10]
  ).map((n) => BigInt(n))

  let used = 0n
  let t = firstMs
  for (const amt of amounts) {
    if (amt <= 0n || used + amt > p.amount || t > NOW) break
    const status = refundStatusFor(t)
    const r = buildRefund(p, amt, t, status, pick(REFUND_REASONS))
    refunds.push(r)
    if (COUNTED_REFUND.includes(status)) used += amt
    t += int(10, 600) * MIN
  }
}
/* ------------------------------------------------------------------ */
/* 固定演示数据：外部来源、大金额、未知枚举、SUSPENDED 占额、需复核           */
/* ------------------------------------------------------------------ */

function fixture(overrides: Partial<PaymentRow>, minutesAgo: number): PaymentRow {
  const base = createPayment(NOW - minutesAgo * MIN)
  return { ...base, ...overrides }
}

const successBase = (ms: number) => ({
  status: 'SUCCESS',
  coreStatus: 'SUCCESS',
  submittedAt: iso(ms + 2000),
  paidAt: iso(ms + 20000),
  closedAt: null,
  failedAt: null,
  failReason: null,
})

const FX_TIME = (m: number) => NOW - m * MIN

export const fixtures = {
  external: fixture(
    {
      ...successBase(FX_TIME(95)),
      source: 'EXTERNAL',
      merchantOrderNo: null,
      storeId: null,
      storeName: null,
      expireAt: null,
      subject: '外部渠道入账交易',
      amount: 3680n,
      paidAmount: 3680n,
    },
    95,
  ),
  large: fixture(
    {
      status: 'CLOSED',
      coreStatus: 'CLOSED',
      subject: '大额对公结算（演示超出双精度的金额）',
      amount: 9007199254740993n,
      paidAmount: null,
      paidAt: null,
      failReason: null,
      closedAt: iso(FX_TIME(130) + PAY_EXPIRE),
    },
    130,
  ),
  unknownEnum: fixture(
    {
      ...successBase(FX_TIME(160)),
      channel: 'PAYPAL_X',
      method: 'FACE_PAY',
      status: 'REVERSED',
      coreStatus: 'REVERSED',
      refundEligibility: 'FROZEN',
      collectionVerification: 'MANUAL_CHECK',
      availableRefundAmount: null,
      refundPrincipalLimit: null,
      pinnedEligibility: true,
      subject: '新渠道试点交易（未知枚举演示）',
    },
    160,
  ),
  suspended: fixture({ ...successBase(FX_TIME(200)), amount: 10000n, paidAmount: 10000n, subject: '异常退款占额演示' }, 200),
  review: fixture(
    {
      ...successBase(FX_TIME(230)),
      amount: 25800n,
      paidAmount: 25800n,
      refundEligibility: 'REVIEW_REQUIRED',
      collectionVerification: 'REVIEW_REQUIRED',
      refundPrincipalLimit: 25800n,
      availableRefundAmount: null,
      pinnedEligibility: true,
      subject: '入账待复核交易',
    },
    230,
  ),
}

payments.push(...Object.values(fixtures))
payments.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
refunds.push(buildRefund(fixtures.suspended, 6000n, FX_TIME(190), 'SUSPENDED', '顾客不满意退货'))
refunds.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

const TERMINAL_REFUND_PENDING: RefundStatus[] = ['CREATED', 'PROCESSING', 'SUSPENDED']

/** 模拟核心：汇总退款、映射核心状态并给出权威可退金额与退款资格 */
export function recomputePayment(p: PaymentRow) {
  const related = refunds.filter((r) => r.paymentId === p.id)
  p.refundCount = related.length
  p.refundedAmount = related.filter((r) => r.status === 'SUCCESS').reduce((s, r) => s + r.amount, 0n)
  p.refundingAmount = related.filter((r) => TERMINAL_REFUND_PENDING.includes(r.status)).reduce((s, r) => s + r.amount, 0n)
  p.refundAggregate = p.refundedAmount === 0n ? 'NONE' : p.refundedAmount >= p.amount ? 'FULL' : 'PARTIAL'
  if (p.status === 'SUCCESS') {
    p.coreStatus = p.refundAggregate === 'FULL' ? 'REFUNDED' : p.refundAggregate === 'PARTIAL' ? 'PART_REFUNDED' : 'SUCCESS'
  }
  if (p.pinnedEligibility) return
  if (p.status !== 'SUCCESS') {
    p.refundPrincipalLimit = null
    p.availableRefundAmount = null
    p.refundEligibility = 'NOT_COLLECTED'
    // 核心 collectionVerification 为必需枚举，未入账订单同样是 PENDING，不用 null 表示
    p.collectionVerification = 'PENDING'
    return
  }
  const occupied = related.filter((r) => COUNTED_REFUND.includes(r.status)).reduce((s, r) => s + r.amount, 0n)
  const available = p.amount - occupied > 0n ? p.amount - occupied : 0n
  p.refundPrincipalLimit = p.amount
  p.availableRefundAmount = available
  p.refundEligibility = available > 0n ? 'ALLOWED' : 'EXHAUSTED'
  p.collectionVerification = 'VERIFIED'
}

export const paymentIndex = new Map(payments.map((p) => [p.id, p]))
for (const p of payments) recomputePayment(p)

/* ------------------------------------------------------------------ */
/* 应用、密钥、Webhook                                                   */
/* ------------------------------------------------------------------ */

export const apps: MerchantApp[] = [
  {
    id: 'app_1',
    appId: 'app_9f3c2a71d40e8b15',
    name: '云栖优选收银系统',
    description: '门店 POS 收银与线上小程序统一下单',
    env: 'production',
    status: 'ACTIVE',
    createdAt: iso(NOW - 380 * DAY),
    permissions: ['payment.create', 'payment.query', 'payment.close', 'refund.create', 'refund.query'],
  },
  {
    id: 'app_2',
    appId: 'app_51be07c6a92f3d48',
    name: '会员小程序',
    description: '会员商城与积分兑换业务',
    env: 'production',
    status: 'ACTIVE',
    createdAt: iso(NOW - 160 * DAY),
    permissions: ['payment.create', 'payment.query', 'refund.query'],
  },
  {
    id: 'app_3',
    appId: 'app_sbx_7d21e4f09c3a',
    name: '联调测试应用',
    description: '开发联调与回归测试使用',
    env: 'sandbox',
    status: 'ACTIVE',
    createdAt: iso(NOW - 40 * DAY),
    permissions: ['payment.create', 'payment.query', 'payment.close', 'refund.create', 'refund.query'],
  },
  {
    id: 'app_4',
    appId: 'app_c08a3e5b6f1d9274',
    name: '旧版自助点餐',
    description: '已下线的自助点餐终端',
    env: 'production',
    status: 'DISABLED',
    createdAt: iso(NOW - 520 * DAY),
    permissions: ['payment.create', 'payment.query'],
  },
]

const hex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('')

export const apiKeys: ApiKey[] = [
  {
    id: 'k1',
    keyId: `kid_${hex(12)}`,
    appId: 'app_9f3c2a71d40e8b15',
    status: 'ACTIVE',
    maskedSecret: `sk_live_••••••••${hex(4)}`,
    createdAt: iso(NOW - 120 * DAY),
    effectiveAt: iso(NOW - 120 * DAY),
    expireAt: null,
    lastUsedAt: iso(NOW - 2 * MIN),
  },
  {
    id: 'k2',
    keyId: `kid_${hex(12)}`,
    appId: 'app_9f3c2a71d40e8b15',
    status: 'EXPIRING',
    maskedSecret: `sk_live_••••••••${hex(4)}`,
    createdAt: iso(NOW - 380 * DAY),
    effectiveAt: iso(NOW - 380 * DAY),
    expireAt: iso(NOW + 5 * DAY),
    lastUsedAt: iso(NOW - 3 * DAY),
  },
  {
    id: 'k3',
    keyId: `kid_${hex(12)}`,
    appId: 'app_51be07c6a92f3d48',
    status: 'ACTIVE',
    maskedSecret: `sk_live_••••••••${hex(4)}`,
    createdAt: iso(NOW - 160 * DAY),
    effectiveAt: iso(NOW - 160 * DAY),
    expireAt: null,
    lastUsedAt: iso(NOW - 14 * MIN),
  },
  {
    id: 'k4',
    keyId: `kid_${hex(12)}`,
    appId: 'app_sbx_7d21e4f09c3a',
    status: 'ACTIVE',
    maskedSecret: `sk_test_••••••••${hex(4)}`,
    createdAt: iso(NOW - 40 * DAY),
    effectiveAt: iso(NOW - 40 * DAY),
    expireAt: null,
    lastUsedAt: iso(NOW - 26 * HOUR),
  },
  {
    id: 'k5',
    keyId: `kid_${hex(12)}`,
    appId: 'app_c08a3e5b6f1d9274',
    status: 'REVOKED',
    maskedSecret: `sk_live_••••••••${hex(4)}`,
    createdAt: iso(NOW - 520 * DAY),
    effectiveAt: iso(NOW - 520 * DAY),
    expireAt: iso(NOW - 90 * DAY),
    lastUsedAt: iso(NOW - 92 * DAY),
  },
]

export const webhookConfigs: WebhookConfig[] = [
  {
    appId: 'app_9f3c2a71d40e8b15',
    url: 'https://pos.yunqi-mart.example/api/payhub/notify',
    enabled: true,
    events: ['PAYMENT.SUCCEEDED', 'PAYMENT.FAILED', 'PAYMENT.CLOSED', 'REFUND.SUCCEEDED', 'REFUND.FAILED', 'REFUND.CLOSED'],
    updatedAt: iso(NOW - 30 * DAY),
  },
  {
    appId: 'app_51be07c6a92f3d48',
    url: 'https://mp.yunqi-mart.example/webhook/pay',
    enabled: true,
    events: ['PAYMENT.SUCCEEDED', 'REFUND.SUCCEEDED'],
    updatedAt: iso(NOW - 60 * DAY),
  },
  {
    appId: 'app_sbx_7d21e4f09c3a',
    url: 'https://dev.yunqi-mart.example/notify',
    enabled: false,
    events: ['PAYMENT.SUCCEEDED', 'REFUND.SUCCEEDED'],
    updatedAt: iso(NOW - 10 * DAY),
  },
  {
    appId: 'app_c08a3e5b6f1d9274',
    url: '',
    enabled: false,
    events: [],
    updatedAt: null,
  },
]

const WEBHOOK_ERRORS: [number | null, string][] = [
  [500, '商户服务返回 500 Internal Server Error'],
  [502, '商户服务返回 502 Bad Gateway'],
  [null, '连接超时（10s）'],
  [404, '通知地址返回 404 Not Found'],
]

let eventSeq = 1
export function buildDelivery(
  resourceType: 'payment' | 'refund',
  resourceId: string,
  eventType: WebhookEventType,
  firstMs: number,
  forcedStatus?: WebhookDeliveryStatus,
): WebhookDelivery {
  const appId = 'app_9f3c2a71d40e8b15'
  const url = webhookConfigs[0]!.url
  const status =
    forcedStatus ??
    weighted<WebhookDeliveryStatus>([
      ['SUCCESS', 91],
      ['FAILED', 5],
      ['RETRYING', NOW - firstMs < 2 * HOUR ? 4 : 0],
    ])
  const attempts = status === 'SUCCESS' ? weighted<number>([[1, 92], [2, 6], [3, 2]]) : status === 'FAILED' ? 8 : int(2, 4)
  const intervals = [0, 15, 15, 30, 180, 600, 1200, 3600].map((s) => s * 1000)
  const attemptLog: WebhookAttempt[] = []
  let t = firstMs
  const err = pick(WEBHOOK_ERRORS)
  for (let i = 0; i < attempts; i++) {
    t += intervals[i] ?? 3600_000
    const ok = status === 'SUCCESS' && i === attempts - 1
    attemptLog.push({
      attempt: i + 1,
      at: iso(Math.min(t, NOW)),
      httpStatus: ok ? 200 : err[0],
      durationMs: ok ? int(40, 320) : err[0] === null ? 10000 : int(80, 900),
      result: ok ? 'SUCCESS' : 'FAILED',
      errorSummary: ok ? null : err[1],
    })
  }
  const seq = eventSeq++
  return {
    id: `wd_${seq}`,
    eventId: `evt_${stamp(new Date(firstMs))}${pad(seq % 10000, 4)}`,
    eventType,
    resourceType,
    resourceId,
    appId,
    url,
    status,
    attempts,
    lastAttemptAt: attemptLog[attemptLog.length - 1]!.at,
    nextRetryAt: status === 'RETRYING' ? iso(NOW + int(2, 25) * MIN) : null,
    attemptLog,
    isTest: false,
  }
}

const WEBHOOK_WINDOW = 10 * DAY
for (const p of payments) {
  const created = new Date(p.createdAt).getTime()
  if (NOW - created > WEBHOOK_WINDOW) break
  if (p.status === 'SUCCESS' && p.paidAt) {
    webhookDeliveries.push(buildDelivery('payment', p.id, 'PAYMENT.SUCCEEDED', new Date(p.paidAt).getTime() + 800))
  } else if (p.status === 'CLOSED' && p.closedAt) {
    webhookDeliveries.push(buildDelivery('payment', p.id, 'PAYMENT.CLOSED', new Date(p.closedAt).getTime() + 800))
  } else if (p.status === 'FAILED' && p.failedAt) {
    webhookDeliveries.push(buildDelivery('payment', p.id, 'PAYMENT.FAILED', new Date(p.failedAt).getTime() + 800))
  }
}
for (const r of refunds) {
  if (!r.finishedAt) continue
  const ms = new Date(r.finishedAt).getTime()
  if (NOW - ms > WEBHOOK_WINDOW) continue
  const type: WebhookEventType =
    r.status === 'SUCCESS' ? 'REFUND.SUCCEEDED' : r.status === 'FAILED' ? 'REFUND.FAILED' : 'REFUND.CLOSED'
  webhookDeliveries.push(buildDelivery('refund', r.id, type, ms + 800))
}
for (const r of refunds) {
  if (r.status !== 'SUSPENDED') continue
  const ms = new Date(r.updatedAt).getTime()
  if (NOW - ms > WEBHOOK_WINDOW) continue
  webhookDeliveries.push(buildDelivery('refund', r.id, 'REFUND.SUSPENDED', ms + 800))
}
webhookDeliveries.sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt))

/* ------------------------------------------------------------------ */
/* 通知                                                                 */
/* ------------------------------------------------------------------ */

const firstSuspended = refunds.find((r) => r.status === 'SUSPENDED')
const firstFailedHook = webhookDeliveries.find((w) => w.status === 'FAILED')

export const notifications: Notification[] = [
  ...(firstSuspended
    ? [
        {
          id: 'n1',
          title: '退款异常处理中',
          description: `退款 ${firstSuspended.id} 正在异常处理中，请稍后查询。`,
          createdAt: firstSuspended.updatedAt,
          read: false,
          level: 'warning' as const,
          link: `/refunds/${firstSuspended.id}`,
        },
      ]
    : []),
  ...(firstFailedHook
    ? [
        {
          id: 'n2',
          title: 'Webhook 通知多次失败',
          description: `事件 ${firstFailedHook.eventId} 已重试 ${firstFailedHook.attempts} 次仍未成功。`,
          createdAt: firstFailedHook.lastAttemptAt,
          read: false,
          level: 'danger' as const,
          link: `/developer/webhook-logs?keyword=${firstFailedHook.eventId}`,
        },
      ]
    : []),
  {
    id: 'n3',
    title: 'API 密钥即将失效',
    description: '「云栖优选收银系统」有 1 个密钥将在 5 天后失效，请及时轮换。',
    createdAt: iso(NOW - 6 * HOUR),
    read: false,
    level: 'warning',
    link: '/developer/keys',
  },
  {
    id: 'n4',
    title: '平台服务公告',
    description: '平台将于本周六 02:00-04:00 进行例行维护，期间交易不受影响。',
    createdAt: iso(NOW - 2 * DAY),
    read: true,
    level: 'info',
  },
]

export function randomHex(n: number) {
  const bytes = new Uint8Array(Math.ceil(n / 2))
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, n)
}

export { DAY, HOUR, MIN, stamp, pad }
