# 商户后台（Merchant Portal）API 协议 v1

本文档描述商户后台前端所依赖的 HTTP 接口。前端代码中的唯一契约是 `src/services/api/types.ts` 中的 `MerchantApi` 接口与 `src/types/index.ts` 中的数据类型，本文档与之一一对应；如两者冲突，以代码类型定义为准，并应同步修正本文档。

> 本协议面向**商户后台网页**（登录用户会话鉴权），不同于商户服务端调用的开放支付 API（HMAC 签名鉴权，见开发者中心 > 接入文档）。

---

## 1. 通用约定

### 1.1 基础信息

| 项目 | 约定 |
| --- | --- |
| Base URL | `/api/portal/v1`（与前端同域，或通过网关反向代理） |
| 协议 | HTTPS，`Content-Type: application/json; charset=utf-8` |
| 鉴权 | 登录后由服务端下发 `HttpOnly; Secure; SameSite=Lax` 的会话 Cookie；所有接口要求已登录，商户维度由会话确定，**任何请求参数都不得用于切换商户** |
| CSRF | 非 GET 请求需携带 `X-CSRF-Token` 请求头（值来自登录响应或 `GET /csrf`） |
| 字段命名 | JSON 字段使用 lowerCamelCase |
| 时间 | ISO 8601 UTC 字符串，如 `2026-11-02T08:30:00.000Z`；前端按浏览器时区展示 |
| 日期参数 | 查询参数中的日期区间使用 `YYYY-MM-DD`，按商户时区（Asia/Shanghai）解释，`from` 取当日 00:00:00，`to` 取当日 23:59:59.999 |
| 金额 | **一律为整数，单位：分（CNY）**，类型记作 `AmountFen`。禁止返回浮点数或字符串金额 |
| 比率 | `0 ~ 1` 的小数，如成功率 `0.9731`；同比/环比为相对变化，如 `0.12` 表示 +12%，`-0.05` 表示 -5% |
| 可空字段 | 明确返回 `null`，不要省略字段 |
| ID | 字符串，前端不解析其结构 |

### 1.2 响应格式

成功：HTTP `2xx`，响应体直接为业务数据（不再包一层 `data`）。

```json
{ "id": "pay_01HX...", "status": "SUCCESS" }
```

无返回内容的接口返回 `204 No Content`。

失败：HTTP `4xx/5xx`，响应体统一为：

```json
{
  "code": "EXCEED_REFUNDABLE",
  "message": "退款金额超过当前可退款金额",
  "requestId": "req_7f3a..."
}
```

前端会将 `message` 直接展示给用户，因此 `message` 必须为面向商户的中文提示，不得包含堆栈或内部信息。

### 1.3 错误码

| HTTP | code | 含义 |
| --- | --- | --- |
| 400 | `VALIDATION` | 参数校验失败（缺失、格式错误、越界） |
| 401 | `UNAUTHENTICATED` | 未登录或会话过期，前端跳转登录页 |
| 403 | `FORBIDDEN` | 已登录但无该操作权限 |
| 404 | `NOT_FOUND` | 资源不存在，**或不属于当前商户**（不要用 403 泄露资源存在性） |
| 409 | `DUPLICATE` | 唯一键冲突（商户门店编号、商户退款编号） |
| 409 | `INVALID_STATUS` | 当前状态不允许该操作 |
| 409 | `EXCEED_REFUNDABLE` | 退款金额超过可退款金额 |
| 409 | `APP_DISABLED` | 应用已停用 |
| 400 | `INVALID_PASSWORD` | 当前密码不正确 |
| 429 | `RATE_LIMITED` | 请求过于频繁 |
| 500 | `INTERNAL` | 服务端异常 |

### 1.4 分页、排序

列表查询参数（Query String）：

| 参数 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `page` | int | 1 | 从 1 开始 |
| `pageSize` | int | 20 | 取值 1–100，超出按边界截断 |
| `sortBy` | string | 见各接口 | 允许的排序字段见各接口，非白名单字段返回 `VALIDATION` |
| `sortOrder` | `asc` \| `desc` | `desc` | |

分页响应 `Paginated<T>`：

```json
{ "items": [], "total": 1234, "page": 1, "pageSize": 20 }
```

`page` 超出最后一页时返回最后一页的数据，并在 `page` 中回写实际页码。

---

## 2. 枚举字典

| 类型 | 取值 |
| --- | --- |
| `PaymentStatus` | `CREATED` 已创建 · `PAYING` 支付中 · `CLOSING` 关闭中 · `SUCCESS` 支付成功 · `FAILED` 支付失败 · `CLOSED` 已关闭 |
| `RefundStatus` | `CREATED` 已受理 · `PROCESSING` 处理中 · `SUCCESS` 退款成功 · `FAILED` 退款失败 · `CLOSED` 已关闭 · `SUSPENDED` 异常挂起 |
| `RefundAggregateStatus` | `NONE` 未退款 · `PARTIAL` 部分退款 · `FULL` 全额退款 |
| `PaymentChannel` | `WECHAT` · `ALIPAY` · `UNIONPAY` |
| `PaymentMethod` | `NATIVE` 扫码 · `JSAPI` 公众号 · `MINI_PROGRAM` 小程序 · `H5` · `APP` · `MICROPAY` 付款码 |
| `StoreStatus` | `ACTIVE` · `DISABLED` |
| `AppEnv` | `production` · `sandbox` |
| `AppStatus` | `ACTIVE` · `DISABLED` |
| `ApiKeyStatus` | `ACTIVE` 生效中 · `PENDING` 待生效 · `EXPIRING` 即将失效（轮换过渡期）· `REVOKED` 已吊销 · `EXPIRED` 已过期 |
| `WebhookEventType` | `payment.succeeded` · `payment.failed` · `payment.closed` · `refund.succeeded` · `refund.failed` · `refund.closed` |
| `WebhookDeliveryStatus` | `SUCCESS` · `FAILED`（重试耗尽）· `RETRYING` |
| `Granularity` | `day` · `week` · `month` |

**重要语义**：退款状态与支付状态相互独立。一笔订单发生退款后 `Payment.status` 仍为 `SUCCESS`，退款进度通过 `refundAggregate`、`refundedAmount`、`refundingAmount` 体现。

---

## 3. 数据模型

### 3.1 Payment 支付订单

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 平台支付订单号 |
| `merchantOrderNo` | string | 商户订单号 |
| `storeId` / `storeName` | string | 所属门店 |
| `subject` | string | 商品描述 |
| `amount` | AmountFen | 订单金额 |
| `paidAmount` | AmountFen \| null | 实付金额，未支付为 null |
| `channel` | PaymentChannel | |
| `method` | PaymentMethod | |
| `status` | PaymentStatus | |
| `createdAt` | string | 创建时间 |
| `submittedAt` | string \| null | 提交渠道时间 |
| `paidAt` | string \| null | 支付成功时间 |
| `closedAt` | string \| null | 关闭时间 |
| `failedAt` | string \| null | 失败时间 |
| `failReason` | string \| null | 失败原因（面向商户） |
| `expireAt` | string | 支付超时时间 |
| `refundedAmount` | AmountFen | 已退款成功金额 |
| `refundingAmount` | AmountFen | 处理中的退款金额（`CREATED` + `PROCESSING`） |
| `refundAggregate` | RefundAggregateStatus | `refundedAmount == 0` 为 NONE；`== amount` 为 FULL；否则 PARTIAL |
| `refundCount` | int | 退款笔数（全部状态） |

### 3.2 Refund 退款

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 平台退款单号 |
| `merchantRefundNo` | string | 商户退款编号（商户内唯一，用于幂等） |
| `paymentId` / `merchantOrderNo` | string | 原支付订单 |
| `storeId` / `storeName` | string | |
| `channel` | PaymentChannel | |
| `amount` | AmountFen | 退款金额 |
| `status` | RefundStatus | |
| `reason` | string | 退款原因 |
| `createdAt` / `updatedAt` | string | |
| `finishedAt` | string \| null | 到达终态时间 |
| `failReason` | string \| null | |
| `progress` | `{ status, at, note? }[]` | 状态流转记录，按时间升序 |

### 3.3 Store 门店

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | |
| `storeNo` | string | 平台门店编号（服务端生成） |
| `merchantStoreNo` | string | 商户门店编号（商户内唯一） |
| `name` | string | |
| `status` | StoreStatus | |
| `address`, `contactName`, `contactPhone` | string | |
| `createdAt` | string | |

### 3.4 MerchantApp 应用

`id`, `appId`, `name`, `description`, `env: AppEnv`, `status: AppStatus`, `createdAt`, `permissions: string[]`（如 `payment.create`、`refund.create`）。

### 3.5 ApiKey 密钥

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 记录 ID |
| `keyId` | string | 对外公开的 Key ID（`ak_...`） |
| `appId` | string | |
| `status` | ApiKeyStatus | |
| `maskedSecret` | string | 掩码后的 Secret，如 `sk_****a1b2` |
| `createdAt` / `effectiveAt` | string | |
| `expireAt` | string \| null | |
| `lastUsedAt` | string \| null | |

`CreatedApiKey` = `ApiKey` + `plainSecret: string`。**明文 Secret 仅在创建/轮换响应中返回一次**，服务端只保存哈希或加密值，之后任何接口不得再返回。

### 3.6 Webhook

`WebhookConfig`：`appId`, `url`, `enabled`, `events: WebhookEventType[]`, `updatedAt`。

`WebhookDelivery`：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 投递记录 ID |
| `eventId` | string | 事件 ID（同事件多次重试保持不变） |
| `eventType` | WebhookEventType | |
| `resourceType` | `payment` \| `refund` | |
| `resourceId` | string | 支付订单号或退款单号 |
| `appId`, `url` | string | |
| `status` | WebhookDeliveryStatus | |
| `attempts` | int | 已尝试次数 |
| `lastAttemptAt` | string | |
| `nextRetryAt` | string \| null | 仅 `RETRYING` 时有值 |
| `attemptLog` | WebhookAttempt[] | 每次尝试：`attempt`, `at`, `httpStatus: number \| null`, `durationMs`, `result: SUCCESS \| FAILED`, `errorSummary: string \| null` |

### 3.7 账户

- `Merchant`：`merchantNo`, `name`, `shortName`, `status: ACTIVE | RESTRICTED`, `legalName`, `creditCode`, `industry`, `contactEmail`, `contactPhone`, `address`, `createdAt`
- `CurrentUser`：`id`, `name`, `email`, `phone`, `role`, `lastLoginAt`, `lastLoginIp`
- `LoginSession`：`id`, `device`, `browser`, `ip`, `location`, `lastActiveAt`, `current: boolean`
- `Notification`：`id`, `title`, `description`, `createdAt`, `read`, `level: info | warning | danger`, `link?`（前端路由路径，如 `/payments/pay_xxx`）

---

## 4. 接口清单

| 前端方法 | HTTP |
| --- | --- |
| `dashboard.summary()` | `GET /dashboard/summary` |
| `dashboard.trend(days)` | `GET /dashboard/trend?days=` |
| `dashboard.channelShare(days)` | `GET /dashboard/channel-share?days=` |
| `dashboard.recentPayments(limit)` | `GET /dashboard/recent-payments?limit=` |
| `payments.list(query)` | `GET /payments` |
| `payments.get(id)` | `GET /payments/{id}` |
| `payments.refundable(id)` | `GET /payments/{id}/refundable` |
| `payments.exportCsv(query)` | `GET /payments/export` |
| `refunds.list(query)` | `GET /refunds` |
| `refunds.get(id)` | `GET /refunds/{id}` |
| `refunds.create(input)` | `POST /refunds` |
| `analytics.query(q)` | `GET /analytics` |
| `stores.list(query)` | `GET /stores` |
| `stores.all()` | `GET /stores/options` |
| `stores.get(id)` | `GET /stores/{id}` |
| `stores.stats(id)` | `GET /stores/{id}/stats` |
| `stores.create(input)` | `POST /stores` |
| `stores.update(id, input)` | `PUT /stores/{id}` |
| `apps.list()` | `GET /apps` |
| `apps.get(appId)` | `GET /apps/{appId}` |
| `keys.list(appId?)` | `GET /api-keys?appId=` |
| `keys.create(appId)` | `POST /apps/{appId}/api-keys` |
| `keys.rotate(id)` | `POST /api-keys/{id}/rotate` |
| `keys.revoke(id)` | `POST /api-keys/{id}/revoke` |
| `webhooks.getConfig(appId)` | `GET /apps/{appId}/webhook` |
| `webhooks.updateConfig(appId, input)` | `PUT /apps/{appId}/webhook` |
| `webhooks.sendTest(appId)` | `POST /apps/{appId}/webhook/test` |
| `webhooks.deliveries(query)` | `GET /webhook-deliveries` |
| `webhooks.deliveriesFor(resourceId)` | `GET /webhook-deliveries/by-resource/{resourceId}` |
| `account.merchant()` | `GET /account/merchant` |
| `account.me()` | `GET /account/me` |
| `account.updateMe(input)` | `PATCH /account/me` |
| `account.changePassword(input)` | `POST /account/password` |
| `account.sessions()` | `GET /account/sessions` |
| `account.revokeSession(id)` | `DELETE /account/sessions/{id}` |
| `account.notifications()` | `GET /account/notifications` |
| `account.markAllRead()` | `POST /account/notifications/read-all` |
| `search(keyword)` | `GET /search?keyword=` |

---

## 5. 接口详情

### 5.1 工作台 Dashboard

#### `GET /dashboard/summary` → `DashboardSummary`

“今日”按商户时区自然日计算，`compare` 为与昨日同时段的相对变化。

```json
{
  "todaySuccessAmount": 12873400,
  "todaySuccessCount": 1532,
  "todayRefundAmount": 230000,
  "todayRefundCount": 12,
  "todaySuccessRate": 0.9731,
  "processingCount": 8,
  "compare": { "successAmount": 0.12, "successCount": 0.08, "refundAmount": -0.05, "refundCount": 0, "successRate": 0.004 }
}
```

- `todaySuccessRate` = 今日成功笔数 / 今日已到达终态的订单笔数（`SUCCESS + FAILED + CLOSED`）；无数据返回 0
- `processingCount` = 当前 `PAYING` 订单数 + `CREATED/PROCESSING` 退款数

#### `GET /dashboard/trend?days=7|30` → `TrendPoint[]`

按日返回最近 `days` 天（含今天），无数据的日期也要返回 0 值点。

`TrendPoint`：`date (YYYY-MM-DD)`, `successAmount`, `successCount`, `refundAmount`, `refundCount`, `totalCount`, `successRate`。

#### `GET /dashboard/channel-share?days=` → `ChannelShare[]`

`{ channel, amount, count }`，仅统计支付成功订单，按 `amount` 降序。

#### `GET /dashboard/recent-payments?limit=10` → `Payment[]`

最近创建的订单，`limit` 最大 50。

### 5.2 支付订单 Payments

#### `GET /payments` → `Paginated<Payment>`

| 参数 | 说明 |
| --- | --- |
| `paymentId` | 平台订单号，精确匹配 |
| `merchantOrderNo` | 商户订单号，精确匹配 |
| `storeId` | |
| `channel` / `method` / `status` | 枚举 |
| `createdFrom` / `createdTo` | 创建日期区间（YYYY-MM-DD） |
| `paidFrom` / `paidTo` | 支付日期区间 |
| `sortBy` | `createdAt`（默认）、`paidAt`、`amount` |

单个条件为空字符串时视为未传。

#### `GET /payments/{id}` → `Payment`

#### `GET /payments/{id}/refundable` → `RefundableInfo`

```json
{ "paymentId": "pay_xxx", "paymentAmount": 10000, "refundedAmount": 3000, "refundingAmount": 2000, "refundableAmount": 5000 }
```

`refundableAmount` = `paymentAmount - refundedAmount - refundingAmount`；订单非 `SUCCESS` 时为 0。前端在打开退款弹窗时实时调用此接口，**不能使用缓存值**。

#### `GET /payments/export` → `{ filename, rows, content }`

查询参数同 `GET /payments`（忽略分页）。单次最多导出 5000 行。

```json
{ "filename": "payments_20261102.csv", "rows": 1532, "content": "\uFEFF平台支付订单号,商户订单号,..." }
```

- `content` 为带 UTF‑8 BOM 的 CSV 文本，金额列为“元”且保留两位小数
- 列：平台支付订单号, 商户订单号, 门店, 订单金额(元), 支付渠道, 支付方式, 支付状态, 创建时间, 支付时间
- 后续若改为异步导出（返回下载链接），需同步调整前端契约

### 5.3 退款 Refunds

#### `GET /refunds` → `Paginated<Refund>`

参数：`refundId`, `merchantRefundNo`, `paymentId`, `storeId`, `status`, `createdFrom`, `createdTo`；`sortBy`：`createdAt`（默认）、`amount`。

#### `GET /refunds/{id}` → `Refund`

#### `POST /refunds` → `201 Refund`

请求体 `CreateRefundInput`：

```json
{ "paymentId": "pay_xxx", "amount": 5000, "merchantRefundNo": "RF202611020001", "reason": "顾客退货" }
```

服务端校验（**必须在事务内对订单行加锁后进行**，防止并发超退）：

1. 订单存在且属于当前商户，否则 `404 NOT_FOUND`
2. 订单状态为 `SUCCESS`，否则 `409 INVALID_STATUS`
3. `amount` 为正整数，否则 `400 VALIDATION`
4. `amount <= refundableAmount`（计入处理中退款），否则 `409 EXCEED_REFUNDABLE`
5. `merchantRefundNo` 去除首尾空格后在商户内唯一，否则 `409 DUPLICATE`
6. `reason` 去除首尾空格，为空时默认“商户发起退款”，最长 80 字

成功后返回 `status = CREATED` 的退款单，并同步更新订单的 `refundingAmount`、`refundCount`。后续状态流转由渠道回调驱动；退款到达终态时更新订单的 `refundedAmount` / `refundingAmount` / `refundAggregate`，并追加 `progress` 记录。

### 5.4 交易统计 Analytics

#### `GET /analytics` → `AnalyticsResult`

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `from` / `to` | 是 | YYYY-MM-DD，跨度最多 366 天；`to` 晚于今天时按今天截断 |
| `granularity` | 是 | `day` \| `week`（周一为一周开始）\| `month` |
| `storeId` | 否 | |
| `channel` | 否 | |

```json
{
  "totals": { "successAmount": 0, "successCount": 0, "refundAmount": 0, "refundCount": 0, "totalCount": 0, "successRate": 0, "avgAmount": 0 },
  "buckets": [{ "label": "11-02", "successAmount": 0, "successCount": 0, "refundAmount": 0, "refundCount": 0, "totalCount": 0, "successRate": 0, "avgAmount": 0 }],
  "byChannel": [{ "channel": "WECHAT", "amount": 0, "count": 0 }],
  "byStore": [{ "storeId": "st_1", "storeName": "旗舰店", "amount": 0, "count": 0 }]
}
```

- `buckets` 连续无缺口，首尾桶按 `from`/`to` 截断
- `label`：day 为 `MM-DD`；week 为 `MM-DD 周`（该周在区间内的第一天）；month 为 `YYYY-MM`
- `avgAmount` = `successAmount / successCount` 四舍五入为整数分，笔数为 0 时为 0
- 退款统计口径：按退款**成功时间**落入区间的退款单
- `byStore` 按 `amount` 降序，包含区间内无交易的门店（值为 0）

### 5.5 门店 Stores

#### `GET /stores` → `Paginated<Store>`

参数：`keyword`（模糊匹配名称、平台门店编号、商户门店编号）、`status`；`sortBy`：`createdAt`（默认）、`name`。

#### `GET /stores/options` → `Store[]`

全部门店（不分页），用于筛选下拉框。门店量预计 < 1000。

#### `GET /stores/{id}` → `Store`

#### `GET /stores/{id}/stats` → `StoreStats`

```json
{ "last30Amount": 0, "last30Count": 0, "last30RefundAmount": 0, "successRate": 0, "trend": [/* 30 个 TrendPoint */] }
```

#### `POST /stores` → `201 Store`，`PUT /stores/{id}` → `Store`

请求体 `StoreInput`：

```json
{ "name": "旗舰店", "merchantStoreNo": "SH001", "address": "上海市...", "contactName": "张三", "contactPhone": "13800000000", "status": "ACTIVE" }
```

- 所有字符串去除首尾空格；`name` 必填（≤ 40 字），否则 `VALIDATION`
- `merchantStoreNo` 必填，商户内唯一（更新时排除自身），冲突返回 `DUPLICATE`
- `contactPhone` 校验大陆手机号或固话格式
- `storeNo` 由服务端生成，不可修改
- 修改门店名称后，列表接口中的 `storeName` 应返回最新名称

### 5.6 应用与密钥

#### `GET /apps` → `MerchantApp[]`，`GET /apps/{appId}` → `MerchantApp`

#### `GET /api-keys?appId=` → `ApiKey[]`

`appId` 可选，按 `createdAt` 降序。

#### `POST /apps/{appId}/api-keys` → `201 CreatedApiKey`

应用不存在 `NOT_FOUND`；应用非 `ACTIVE` 返回 `APP_DISABLED`。新密钥 `status = ACTIVE`。同一应用同时有效（ACTIVE + EXPIRING + PENDING）的密钥建议不超过 5 个，超出返回 `INVALID_STATUS`。

#### `POST /api-keys/{id}/rotate` → `201 CreatedApiKey`

- 原密钥为 `REVOKED/EXPIRED` 时返回 `INVALID_STATUS`
- 签发新密钥（ACTIVE），原密钥置为 `EXPIRING`，`expireAt = now + 24h`，过渡期内新旧密钥均可验签
- 到期后由后台任务将其置为 `EXPIRED`

#### `POST /api-keys/{id}/revoke` → `ApiKey`

立即失效：`status = REVOKED`，`expireAt = now`。该操作不可逆。

> 以上三个写操作属于高危操作，服务端需记录审计日志（操作人、IP、时间、keyId），建议要求近 15 分钟内完成过登录或二次验证。

### 5.7 Webhook

#### `GET /apps/{appId}/webhook` → `WebhookConfig`

应用未配置过时返回默认值：`{ url: "", enabled: false, events: [], updatedAt }`，不要返回 404。

#### `PUT /apps/{appId}/webhook` → `WebhookConfig`

```json
{ "url": "https://example.com/pay/notify", "enabled": true, "events": ["payment.succeeded", "refund.succeeded"] }
```

- `enabled = true` 时 `url` 必须是 `https://` 地址，否则 `VALIDATION`
- 建议拒绝内网/回环地址（SSRF 防护）
- `events` 去重，非法事件返回 `VALIDATION`

#### `POST /apps/{appId}/webhook/test` → `{ httpStatus, durationMs }`

向已配置地址同步推送一条测试事件（`eventType` 使用 `payment.succeeded`，Body 中 `test: true`），超时 5 秒。未配置地址或未启用时返回 `VALIDATION`。对方返回非 2xx 时**仍返回 200**，由 `httpStatus` 体现；连接失败时返回 `httpStatus: 0`。

#### `GET /webhook-deliveries` → `Paginated<WebhookDelivery>`

参数：`keyword`（匹配 `eventId`、`resourceId`）、`eventType`、`status`；按 `lastAttemptAt` 降序。

#### `GET /webhook-deliveries/by-resource/{resourceId}` → `WebhookDelivery[]`

返回某支付订单或退款单相关的全部投递记录，用于详情页展示。

#### 推送规范（服务端 → 商户）

请求头：

```
Content-Type: application/json
X-Pay-Event-Id: evt_01HX...
X-Pay-Timestamp: 1767225600
X-Pay-Signature: <hex>
```

签名：`hex(HMAC-SHA256(apiSecret, timestamp + "." + rawBody))`，使用该应用当前有效的 API Secret（轮换过渡期内使用新密钥签名）。

Body：

```json
{ "id": "evt_01HX...", "type": "payment.succeeded", "createdAt": "2026-11-02T08:30:00.000Z", "data": { /* Payment 或 Refund 对象 */ } }
```

重试策略：商户返回 HTTP 2xx 视为成功；否则按 1m、5m、15m、1h、6h 间隔重试，共 6 次尝试，耗尽后状态为 `FAILED`。每次尝试记录到 `attemptLog`，`errorSummary` 保留响应体前 200 字符或网络错误描述。

### 5.8 账户 Account

| 接口 | 说明 |
| --- | --- |
| `GET /account/merchant` → `Merchant` | 商户资料只读 |
| `GET /account/me` → `CurrentUser` | |
| `PATCH /account/me` → `CurrentUser` | Body `{ "name": "李四" }`，去除空格后不能为空，≤ 20 字 |
| `POST /account/password` → `204` | Body `{ "current": "...", "next": "..." }`；当前密码错误 `INVALID_PASSWORD`；新密码至少 8 位且需包含字母和数字，否则 `VALIDATION`；成功后注销除当前会话外的所有会话 |
| `GET /account/sessions` → `LoginSession[]` | 当前会话 `current: true`，按 `lastActiveAt` 降序 |
| `DELETE /account/sessions/{id}` → `204` | 不能下线当前会话；不存在或为当前会话返回 `NOT_FOUND` |
| `GET /account/notifications` → `Notification[]` | 最近 50 条，按时间降序 |
| `POST /account/notifications/read-all` → `204` | |

### 5.9 全局搜索

#### `GET /search?keyword=` → `GlobalSearchResult[]`

`keyword` 去除空格后少于 2 个字符时返回空数组。匹配平台/商户订单号、退款单号、门店名称或编号，最多返回 10 条。

```json
[{ "type": "payment", "id": "pay_xxx", "title": "pay_xxx", "subtitle": "旗舰店 · ¥128.00 · 支付成功", "to": "/payments/pay_xxx" }]
```

`to` 为前端路由路径：`/payments/{id}`、`/refunds/{id}`、`/stores/{id}`。

---

## 6. 前端接入方式

页面只依赖 `src/services/api/index.ts` 导出的 `api` 对象。后端就绪后：

1. 新建 `src/services/http/api.ts`，用 `fetch` 实现 `MerchantApi`，按第 4 节映射 URL
2. 统一处理错误：非 2xx 时解析响应体并 `throw new ApiError(body.message, body.code)`；401 跳转登录
3. 在 `src/services/api/index.ts` 中将 `mockApi` 替换为 `httpApi`（可用 `import.meta.env.VITE_USE_MOCK` 切换）

页面与组件无需修改。
