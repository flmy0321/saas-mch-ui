// V051 回归：HTTP 视图严格解析与 App 选择器分页判断。
// 用 Vite SSR 加载真实 TS 源码；client.request 与 services/api 由内存替身替换，不发任何网络请求。
// 运行：node scripts/verify-051.mjs
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STUB_CLIENT = '\0stub-client'
const STUB_API = '\0stub-api'

const server = await createServer({
  root,
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  plugins: [
    {
      name: 'v051-stubs',
      enforce: 'pre',
      resolveId(id, importer) {
        if (id === './client' && importer?.endsWith('services/http/api.ts')) return STUB_CLIENT
        // Vite 的 alias 先于插件执行，此处看到的是已展开的绝对路径
        if (/\/src\/services\/api(\.ts)?$/.test(id) && importer?.includes('useAppPicker')) return STUB_API
      },
      load(id) {
        if (id === STUB_CLIENT)
          return `export const API_BASE='/api/portal/v1';export const seg=(s)=>encodeURIComponent(s);
            export async function request(){ const r = globalThis.__next; if (r instanceof Error) throw r; return structuredClone(r) }`
        if (id === STUB_API)
          return `export const api={apps:{list:async(q)=>{ const r = globalThis.__pages.shift(); if(!r) throw new Error('no page'); return r }}}`
      },
    },
  ],
})

let pass = 0
let fail = 0
const ok = (name, cond) => {
  if (cond) pass++
  else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
}
async function rejects(fn) {
  try {
    await fn()
    return false
  } catch (e) {
    return /格式|MALFORMED|异常/.test(String(e?.code ?? '') + String(e?.message ?? ''))
  }
}
async function accepts(fn) {
  try {
    await fn()
    return true
  } catch (e) {
    console.log('      ', e?.message)
    return false
  }
}

try {
  const { httpApi } = await server.ssrLoadModule('/src/services/http/api.ts')
  const T = '2026-11-15T01:02:03.456Z'

  const payment = {
    id: 'pay_1', source: 'API', merchantOrderNo: 'M1', storeId: 'st_1', storeName: '门店', subject: '商品',
    amount: '128.00', currency: 'CNY', channel: 'WECHAT', method: 'NATIVE', createdAt: T, paidAt: T, expireAt: null,
    refundedAmount: '0.00', refundingAmount: '0.00', refundPrincipalLimit: '128.00', availableRefundAmount: '128.00',
    refundEligibility: 'ELIGIBLE', collectionVerification: 'VERIFIED', status: 'SUCCESS', coreStatus: 'SUCCESS', refundAggregate: 'NONE',
  }
  const detail = (p, asOf = T) => ({ viewVersion: 'portal-payment-detail-view/0.1-draft', payment: p, asOf })
  const getPayment = (body) => { globalThis.__next = body; return httpApi.payments.get('pay_1') }

  ok('037 合法详情通过', await accepts(() => getPayment(detail(payment))))
  ok('037 EXTERNAL subject=null 通过', await accepts(() => getPayment(detail({ ...payment, source: 'EXTERNAL', merchantOrderNo: null, subject: null }))))
  ok('037 EXTERNAL subject 为真实字符串通过', await accepts(() => getPayment(detail({ ...payment, source: 'EXTERNAL', merchantOrderNo: null }))))
  ok('037 amount=123(number) 拒绝', await rejects(() => getPayment(detail({ ...payment, amount: 123 }))))
  ok('037 amount="128.5" 拒绝', await rejects(() => getPayment(detail({ ...payment, amount: '128.5' }))))
  ok('037 id=123 拒绝', await rejects(() => getPayment(detail({ ...payment, id: 123 }))))
  ok('037 source=ALIEN 拒绝', await rejects(() => getPayment(detail({ ...payment, source: 'ALIEN' }))))
  ok('037 currency=USD 拒绝', await rejects(() => getPayment(detail({ ...payment, currency: 'USD' }))))
  ok('037 status 为对象拒绝', await rejects(() => getPayment(detail({ ...payment, status: {} }))))
  ok('037 未知 status 字符串保留通过', await accepts(() => getPayment(detail({ ...payment, status: 'NEW_STATE' }))))
  ok('037 asOf=not-a-date 拒绝', await rejects(() => getPayment(detail(payment, 'not-a-date'))))
  ok('037 paidAt 不存在日期 2026-02-30 拒绝', await rejects(() => getPayment(detail({ ...payment, paidAt: '2026-02-30T00:00:00.000Z' }))))
  ok('037 paidAt 无毫秒拒绝', await rejects(() => getPayment(detail({ ...payment, paidAt: '2026-11-15T01:02:03Z' }))))
  ok('037 API 缺 subject 拒绝', await rejects(() => getPayment(detail({ ...payment, subject: null }))))
  ok('037 额外键拒绝', await rejects(() => getPayment(detail({ ...payment, extra: 1 }))))

  const refund = {
    id: 'rf_1', merchantRefundNo: 'R1', paymentId: 'pay_1', storeId: null, storeName: null, amount: '10.00',
    status: 'SUCCESS', reason: null, createdAt: T, finishedAt: T,
  }
  const rs = (r) => ({ viewVersion: 'portal-refund-view/0.1-draft', refund: r, asOf: T })
  const getRefund = (body) => { globalThis.__next = body; return httpApi.refunds.get('rf_1') }
  ok('038 合法退款通过', await accepts(() => getRefund(rs(refund))))
  ok('038 amount=not-money 拒绝', await rejects(() => getRefund(rs({ ...refund, amount: 'not-money' }))))
  ok('038 SUSPENDED 带 finishedAt 拒绝', await rejects(() => getRefund(rs({ ...refund, status: 'SUSPENDED' }))))
  ok('038 SUSPENDED finishedAt=null 通过', await accepts(() => getRefund(rs({ ...refund, status: 'SUSPENDED', finishedAt: null }))))
  ok('038 SUCCESS finishedAt=null 通过（来源为空不兜底）', await accepts(() => getRefund(rs({ ...refund, finishedAt: null }))))
  ok('038 createdAt 非法格式拒绝', await rejects(() => getRefund(rs({ ...refund, createdAt: '2026/11/15' }))))

  const app = (n) => ({ id: `a${n}`, appId: `app_${n}`, name: `App ${n}`, env: 'PROD', status: 'ACTIVE', createdAt: T })
  const appPage = (items, page, pageSize, total) => ({ viewVersion: 'portal-app-view/0.1-draft', items, total, page, pageSize, asOf: T })
  const listApps = (body) => { globalThis.__next = body; return httpApi.apps.list({ page: body.page, pageSize: body.pageSize }) }
  ok('038 App 一致末页通过', await accepts(() => listApps(appPage([app(1), app(2), app(3)], 1, 100, 3))))
  ok('038 App 短页但 total 未满(1/3) 拒绝', await rejects(() => listApps(appPage([app(1)], 1, 100, 3))))
  ok('038 App 空页但 total>0 拒绝', await rejects(() => listApps(appPage([], 1, 100, 3))))
  // 3.8.3 超尾页：返回最后一页数据并回写实际页码；回写超尾页码的空页属于畸形
  ok('038 App 超尾页回写末页通过', await accepts(() => listApps(appPage([app(1), app(2), app(3)], 1, 20, 3))))
  ok('038 App 回写超尾页码的空页拒绝', await rejects(() => listApps(appPage([], 5, 20, 3))))
  ok('038 App 空结果 total=0 通过', await accepts(() => listApps(appPage([], 1, 20, 0))))

  // useAppCollection 直接使用替身 api，验证 UI 层不会静默停在 1/3
  const { useAppCollection } = await server.ssrLoadModule('/src/composables/useAppPicker.ts')
  const settle = async (c) => {
    for (let i = 0; i < 50 && c.loading.value; i++) await new Promise((r) => setTimeout(r, 0))
  }
  const run = async (pages) => {
    globalThis.__pages = pages
    const c = useAppCollection() // 创建时自动加载第 1 页
    await settle(c)
    return c
  }
  const pg = (items, page, pageSize, total) => ({ items, page, pageSize, total })
  let c = await run([pg([app(1)], 1, 100, 3)])
  ok('选择器 短页 1/3：提示变化且不宣称完成', c.changed.value !== null && c.hasMore.value === false && c.loadedCount.value === 1)
  c = await run([pg([], 1, 100, 3)])
  ok('选择器 空页 total=3：提示变化', c.changed.value !== null)
  c = await run([pg([app(1), app(2), app(3)], 1, 100, 3)])
  ok('选择器 一致单页：完成且无变化', c.changed.value === null && c.hasMore.value === false && c.loadedCount.value === 3)
  const full = Array.from({ length: 100 }, (_, i) => app(i))
  c = await run([pg(full, 1, 100, 150)])
  ok('选择器 首页满页：可继续加载', c.changed.value === null && c.hasMore.value === true && c.loadedCount.value === 100)
  globalThis.__pages = [pg([app(0), ...Array.from({ length: 49 }, (_, i) => app(200 + i))], 2, 100, 150)]
  await c.loadMore()
  ok('选择器 跨页重复 appId：按去重计数并提示变化', c.loadedCount.value === 149 && c.changed.value !== null)
} finally {
  await server.close()
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
