/**
 * 接入契约的测试响应检查：直接调用真实解析器与命令执行器，不经过 Mock。
 * 运行：npm run test:contract
 */
import assert from 'node:assert/strict'

class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  clear() {
    this.m.clear()
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
  get length() {
    return this.m.size
  }
}
const g = globalThis as Record<string, unknown>
g.sessionStorage ??= new MemoryStorage()
g.localStorage ??= new MemoryStorage()

const { parseTrend, parseChannelShare, parseAnalytics, parseStoreStats, parseGlobalSearch } = await import('../src/services/http/api')
const { parseKeyCommand, parseWebhookTest, parseWebhookCommand } = await import('../src/services/http/commands')
const { runCommand, getPendingCommand, forgetCommand, isVersionConflict, webhookTestSucceeded } = await import(
  '../src/services/commands'
)
const { ApiError } = await import('../src/services/api/types')

let passed = 0
const failures: string[] = []
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (e) {
    failures.push(name)
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message : String(e)}`)
  }
}
const rejects = (fn: () => unknown) => assert.throws(fn, (e: unknown) => e instanceof ApiError)

/* ---------- 报表：零值与数据未就绪 ---------- */
const ZERO = {
  successAmount: '0.00',
  successCount: '0',
  refundAmount: '0.00',
  refundCount: '0',
  totalCount: '0',
  terminalCount: '0',
  createdSuccessCount: '0',
}
const base = (extra: Record<string, unknown>) => ({
  viewVersion: 'merchant-completed-report/1-draft',
  asOf: '2026-11-17T08:00:00.000Z',
  timezone: 'Asia/Shanghai',
  coverageStart: '2026-11-01',
  fromDate: '2026-11-10',
  toDate: '2026-11-16',
  ...extra,
})
const ratio = { refundRate: null, successRate: null }

console.log('报表零值与数据未就绪')
await check('趋势：全零指标的营业日被接受，零值保持字符串', () => {
  const v = parseTrend(base({ points: [{ date: '2026-11-10', metrics: ZERO, presentation: ratio }] }), 7)
  assert.equal(v.points[0].metrics.successAmount, '0.00')
  assert.equal(v.points[0].metrics.successCount, '0')
})
await check('趋势：数据未就绪（coverageStart=null、无营业日）被接受为空序列', () => {
  const v = parseTrend(base({ coverageStart: null, points: [] }), 7)
  assert.equal(v.coverageStart, null)
  assert.equal(v.points.length, 0)
})
await check('趋势：零分母比率为 null，前端不重算', () => {
  const v = parseTrend(base({ points: [{ date: '2026-11-10', metrics: ZERO, presentation: ratio }] }), 7)
  assert.equal((v.points[0].presentation as Record<string, unknown>).refundRate, null)
})
await check('趋势：金额为 number 时拒绝', () => {
  rejects(() => parseTrend(base({ points: [{ date: '2026-11-10', metrics: { ...ZERO, successAmount: 0 }, presentation: ratio }] }), 7))
})
await check('渠道占比：无渠道数据时 items 为空', () => {
  assert.equal(parseChannelShare(base({ items: [] })).items.length, 0)
})
await check('经营分析：数据未就绪时全零且分桶为空', () => {
  const v = parseAnalytics(
    base({
      coverageStart: null,
      current: { fromDate: '2026-11-10', toDate: '2026-11-16', metrics: ZERO },
      previous: { fromDate: '2026-11-03', toDate: '2026-11-09', metrics: ZERO },
      presentation: ratio,
      buckets: [],
      byChannel: [],
      byStore: [],
      directoryMode: 'COMPLETE',
    }),
  )
  assert.equal(v.buckets.length, 0)
  assert.equal(v.current.metrics.successAmount, '0.00')
})
await check('门店统计：零值门店被接受', () => {
  const v = parseStoreStats(base({ storeId: 'sto_001', metrics: ZERO, presentation: ratio, points: [] }))
  assert.equal(v.metrics.totalCount, '0')
})

/* ---------- 搜索分组状态 ---------- */
const group = (type: string, state: string, items: unknown[] = [], hasMore = false) => ({
  type,
  state,
  items,
  hasMore,
  asOf: '2026-11-17T08:00:00.000Z',
})
const SEARCH_V = 'portal-global-search-view/0.1-draft'

console.log('搜索分组状态')
await check('OK / NOT_AUTHORIZED / NOT_APPLICABLE 三种分组同时出现', () => {
  const v = parseGlobalSearch({
    viewVersion: SEARCH_V,
    groups: [
      group('payment', 'OK', [{ type: 'payment', id: 'pay_1', title: '订单 pay_1', to: '/payments/pay_1' }], true),
      group('refund', 'NOT_AUTHORIZED'),
      group('store', 'NOT_APPLICABLE'),
    ],
  })
  assert.deepEqual(
    v.groups.map((x) => x.state),
    ['OK', 'NOT_AUTHORIZED', 'NOT_APPLICABLE'],
  )
})
await check('NOT_AUTHORIZED 分组带结果时拒绝', () => {
  rejects(() =>
    parseGlobalSearch({
      viewVersion: SEARCH_V,
      groups: [group('refund', 'NOT_AUTHORIZED', [{ type: 'refund', id: 'r', title: 'r', to: '/refunds/r' }])],
    }),
  )
})
await check('非 OK 分组 hasMore=true 时拒绝', () => {
  rejects(() => parseGlobalSearch({ viewVersion: SEARCH_V, groups: [group('store', 'NOT_APPLICABLE', [], true)] }))
})
await check('同一类型重复分组时拒绝', () => {
  rejects(() => parseGlobalSearch({ viewVersion: SEARCH_V, groups: [group('store', 'OK'), group('store', 'OK')] }))
})
await check('站外跳转地址被拒绝', () => {
  rejects(() =>
    parseGlobalSearch({
      viewVersion: SEARCH_V,
      groups: [group('payment', 'OK', [{ type: 'payment', id: 'p', title: 'p', to: '//evil.example/x' }])],
    }),
  )
})

/* ---------- 命令：版本冲突与按原号恢复 ---------- */
const KEY_V = 'portal-key-command-view/0.1-draft'
const WH_V = 'portal-webhook-command-view/0.1-draft'
const key = { appId: 'app_1', keyId: 'key_1', status: 'ACTIVE', createdAt: 't', validFrom: 't', validUntil: null, revokedAt: null }
const keyApplied = (commandId: string, secret?: string) => ({
  viewVersion: KEY_V,
  status: 'APPLIED',
  commandId,
  configurationVersion: '9007199254740993',
  key,
  ...(secret === undefined ? {} : { secret }),
})
const once = { attempts: 1, intervalMs: 0 }

console.log('配置版本冲突')
await check('409 VERSION_CONFLICT 原样抛出且不留待确认、不查询', async () => {
  let lookups = 0
  await assert.rejects(
    runCommand({
      scope: 't.conflict',
      params: {},
      send: async () => {
        throw new ApiError('conflict', 'VERSION_CONFLICT', { httpStatus: 409 })
      },
      lookup: async () => {
        lookups++
        return { status: 'NOT_OBSERVED' as const }
      },
      lookupOptions: once,
    }),
    (e: unknown) => isVersionConflict(e),
  )
  assert.equal(lookups, 0)
  assert.equal(getPendingCommand('t.conflict'), null)
})
await check('超过 2^53 的配置版本保持为原字符串', () => {
  const r = parseWebhookCommand({ viewVersion: WH_V, status: 'APPLIED', commandId: 'c', configurationVersion: '9007199254740993' }, 'c')
  assert.equal(r.status === 'APPLIED' && r.result.configurationVersion, '9007199254740993')
})
await check('配置版本为 number 时拒绝', () => {
  rejects(() => parseWebhookCommand({ viewVersion: WH_V, status: 'APPLIED', commandId: 'c', configurationVersion: 3 }, 'c'))
})

console.log('断线后按原号恢复')
await check('断线后只按同一 commandId 查询，不重发', async () => {
  let sends = 0
  let sentId = ''
  const seen: string[] = []
  const out = await runCommand({
    scope: 't.network',
    params: { appId: 'app_1' },
    send: async (id) => {
      sends++
      sentId = id
      assert.ok(getPendingCommand('t.network'), '发送前应先保存命令号')
      throw new ApiError('network', 'NETWORK', { httpStatus: 0 })
    },
    lookup: async (cmd) => {
      seen.push(cmd.commandId)
      return parseKeyCommand(keyApplied(cmd.commandId), cmd.commandId, 'app_1')
    },
    lookupOptions: once,
  })
  assert.equal(sends, 1)
  assert.deepEqual(seen, [sentId])
  assert.equal(out.state, 'APPLIED')
  assert.equal(out.state === 'APPLIED' && out.recovered, true)
  assert.equal(getPendingCommand('t.network'), null)
})
await check('202 UNKNOWN 后查询仍为 NOT_OBSERVED：保持待确认并阻止再次提交', async () => {
  const out = await runCommand({
    scope: 't.unknown',
    params: {},
    send: async () => ({ status: 'UNKNOWN' as const }),
    lookup: async () => ({ status: 'NOT_OBSERVED' as const }),
    lookupOptions: once,
  })
  assert.equal(out.state, 'PENDING')
  assert.ok(getPendingCommand('t.unknown'))
  await assert.rejects(
    runCommand({
      scope: 't.unknown',
      params: {},
      send: async () => {
        throw new Error('不应再次发送')
      },
      lookup: async () => ({ status: 'NOT_OBSERVED' as const }),
    }),
    (e: unknown) => e instanceof ApiError && e.code === 'COMMAND_PENDING',
  )
  forgetCommand('t.unknown')
})
await check('回执 commandId 与提交不一致时拒绝', () => {
  rejects(() => parseKeyCommand(keyApplied('other'), 'mine', 'app_1'))
})

/* ---------- API Key 明文仅首次展示 ---------- */
console.log('API Key 明文仅首次展示')
await check('首次响应带顶层 secret 时返回明文', () => {
  const r = parseKeyCommand(keyApplied('c1', 'sk_live_once'), 'c1', 'app_1')
  assert.equal(r.status === 'APPLIED' && r.result.secret, 'sk_live_once')
})
await check('按原号查询恢复的结果不含明文', async () => {
  const out = await runCommand({
    scope: 't.secret',
    params: { appId: 'app_1' },
    send: async () => {
      throw new ApiError('timeout', 'TIMEOUT', { httpStatus: 0 })
    },
    lookup: async (cmd) => parseKeyCommand(keyApplied(cmd.commandId), cmd.commandId, 'app_1'),
    lookupOptions: once,
  })
  assert.equal(out.state === 'APPLIED' && out.result.secret, null)
})
await check('待确认记录中不保存明文', async () => {
  await runCommand({
    scope: 't.secret2',
    params: { appId: 'app_1' },
    send: async () => ({ status: 'UNKNOWN' as const }),
    lookup: async () => ({ status: 'NOT_OBSERVED' as const }),
    lookupOptions: once,
  })
  assert.ok(!JSON.stringify(sessionStorage.getItem('portal.pendingCommands')).includes('sk_'))
  forgetCommand('t.secret2')
})

/* ---------- Webhook 测试 ---------- */
const testReply = (status: string, httpStatus: number) => ({ viewVersion: WH_V, status, commandId: 'w', httpStatus, durationMs: 120 })
console.log('Webhook 对端返回 500')
await check('COMPLETED + 500 判定为投递失败', () => {
  const r = parseWebhookTest(testReply('COMPLETED', 500), 'w')
  assert.ok(r.status === 'APPLIED')
  assert.equal(webhookTestSucceeded(r.result), false)
})
await check('COMPLETED + 204 判定为投递成功', () => {
  const r = parseWebhookTest(testReply('COMPLETED', 204), 'w')
  assert.ok(r.status === 'APPLIED' && webhookTestSucceeded(r.result))
})
await check('NOT_SENT + 0 判定为失败', () => {
  const r = parseWebhookTest(testReply('NOT_SENT', 0), 'w')
  assert.ok(r.status === 'APPLIED' && !webhookTestSucceeded(r.result))
})
await check('NOT_SENT 带非 0 状态码时拒绝', () => {
  rejects(() => parseWebhookTest(testReply('NOT_SENT', 500), 'w'))
})

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) process.exit(1)
