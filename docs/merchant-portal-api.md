# 商户后台（Merchant Portal）网页接口协议 v1.1（候选草案）

> **文档状态：候选草案，不可原样作为后端实现依据。** 已根据《UI 协议核查结果》（2026-11-03）修订。标记为 **【待核对】** 的条目依赖 payment-core 的权威契约（OpenAPI / Schema / 枚举 / 通知契约 / 内部管理 API），在契约补齐前不得自行定义实现。

本文档描述商户后台前端（Portal）所依赖的网页接口。它与 `src/services/api/types.ts`、`src/types/index.ts` 的对应关系**只用于保证 UI 草案内部一致**，不能凌驾于已锁定的跨系统规则；两者与核心契约冲突时，以核心契约为准，并同步修改本文档与前端代码（差异清单见第 8 节）。

> 本协议面向**商户后台网页**（登录用户会话鉴权），不同于商户服务端调用的开放支付 API（HMAC 签名鉴权）。网页接口可以与开放 API 不同，由商户平台服务适配，但**不得改变核心资金规则，也不得另建核心主数据**。

---

## 0. 职责边界

| 能力 | 归属 | 商户平台（Portal 后端）职责 |
| --- | --- | --- |
| 支付/退款资金事务、退款额度预占、Provider 回调、状态推进 | payment-core | 权限校验、参数适配、调用核心、展示。**不直写核心库，不在本地保存可写资金状态副本** |
| 退款额度与退款资格判定 | payment-core | 透传核心返回的权威值，不自行计算裁决 |
| 商户事件通知的发送、重试、确认、历史快照 | payment-core | 提供配置、查询、测试入口；不另建通知引擎 |
| 门店 / App 主数据 | payment-core（经核心管理 API） | 提供管理入口，写操作转调核心；不另建第二份可写主数据 |
| 密钥、通知配置的管理 | **【待核对】** 归属、管理契约与权限尚未定义 | 补齐前仅按本文 UI 草案联调 Mock |
| 登录、会话、成员与权限 | 商户平台 / identity **【待核对】** | 见 5.0、7 |

核心内部管理 API 尚未设计。本文第 4、5 节列出的是 **Portal 网页接口**，不代表核心端点；Portal → 核心的调用映射须在核心契约发布后补充，不得臆造。

---

## 1. 通用约定

### 1.1 基础信息

| 项目 | 约定 |
| --- | --- |
| Base URL | `/api/portal/v1`（与前端同域，或通过网关反向代理） |
| 协议 | HTTPS，`Content-Type: application/json; charset=utf-8` |
| 鉴权 | Bearer Token：除 `/auth/*` 外所有接口须携带 `Authorization: Bearer <accessToken>`，详见 5.0。商户维度由 token 对应的用户确定，**任何请求参数都不得用于切换商户** |
| CSRF | 不使用 Cookie 鉴权，因此无需 CSRF Token；服务端不得从 Cookie 读取凭证 |
| CORS | 如前后端不同域，仅放行商户后台域名，允许 `Authorization` 请求头，不要使用 `Access-Control-Allow-Origin: *` |
| 字段命名 | JSON 字段使用 lowerCamelCase |
| 时间 | ISO 8601 UTC 字符串，如 `2026-11-02T08:30:00.000Z`；前端按浏览器时区展示 |
| 日期参数 | 查询参数中的日期区间使用 `YYYY-MM-DD`，按商户时区（Asia/Shanghai）解释，`from` 取当日 00:00:00，`to` 取当日 23:59:59.999 |
| 金额 | **【待决策】** 见下方“金额约定” |
| 比率 | `0 ~ 1` 的小数，如成功率 `0.9731`；同比/环比为相对变化，如 `0.12` 表示 +12%，`-0.05` 表示 -5% |
| 可空字段 | 明确返回 `null`，不要省略字段 |
| ID | 字符串，前端不解析其结构 |
| 未知枚举值 | 服务端可能返回本文未列出的枚举值（核心新增渠道、方式、状态），前端必须原样展示为“未知(原值)”，不得报错或归入其他取值 |

#### 金额约定（记作 `AmountFen`）

核心金额为**十进制字符串**。网页接口有两种方案，需在实现前确定：

- **方案 A（推荐）**：网页接口同样使用十进制字符串（单位：元，如 `"128.00"`），前端用十进制库计算与展示，与核心一致，无上限问题。
- **方案 B（当前前端实现）**：网页接口使用整数分。约束：
  1. Portal 后端将核心字符串**按字符串精确转换**为分（不得 `Number()` / `parseFloat()` 后乘 100）；
  2. 网页接口支持的上限为 `9007199254740991` 分（JavaScript 安全整数），单笔金额或统计合计超出时返回 `500 INTERNAL` 并告警，不得截断或返回近似值；
  3. 统计合计在后端使用 64 位整数 / 十进制累加。

上述“禁止字符串金额”仅适用于方案 B 下的 JSON 接口；CSV 导出的金额列始终为“元”字符串（见 5.2）。

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
| 401 | `UNAUTHENTICATED` | 未携带 token、token 无效/过期/已吊销。**服务端必须在执行任何业务逻辑之前完成认证**，保证返回 401 时请求未产生副作用；前端据此刷新令牌并重试一次（见 5.0） |
| 400 | `CAPTCHA_INVALID` | 登录验证码错误或已过期（验证码一次性使用） |
| 401 | `INVALID_CREDENTIALS` | 账号或密码错误，`message` 可带剩余尝试次数 |
| 423 | `ACCOUNT_LOCKED` | 连续登录失败过多，账号临时锁定 |
| 403 | `FORBIDDEN` | 已登录但无该操作权限 |
| 404 | `NOT_FOUND` | 资源不存在，**或不属于当前商户**（不要用 403 泄露资源存在性） |
| 409 | `DUPLICATE` | 唯一键冲突（仅商户门店编号等主数据唯一键）。**不用于商户退款编号** |
| 409 | `IDEMPOTENCY_CONFLICT` | 同一商户退款编号已用于不同业务参数的退款（见 5.3） |
| 409 | `INVALID_STATUS` | 当前状态不允许该操作 |
| 409 | `EXCEED_REFUNDABLE` | 退款金额超过核心判定的可退金额（由核心校验后映射） |
| 409 | `REFUND_NOT_ELIGIBLE` | 核心判定该订单当前不具备退款资格（`refundEligibility`），`message` 透传面向商户的原因 |
| 502 / 504 | `UPSTREAM_UNKNOWN` | 调用核心超时或结果未知。**资金结果未确定**，前端不得自动重发，须按原业务号查询（见 5.3） |
| 503 | `UPSTREAM_UNAVAILABLE` | 核心明确未受理（可安全重试，仍须使用原业务号） |
| 409 | `APP_DISABLED` | 应用已停用 |
| 400 | `INVALID_PASSWORD` | 当前密码不正确 |
| 429 | `RATE_LIMITED` | 请求过于频繁 |
| 500 | `INTERNAL` | 服务端异常 |

**【待核对】** 核心错误码 → 网页错误码的映射表待核心契约发布后补充；映射前不得把未知核心错误统一映射为 `VALIDATION`。

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
| `PaymentStatus`（网页视图） | `CREATED` 已创建 · `PAYING` 支付中 · `CLOSING` 关闭中 · `SUCCESS` 支付成功 · `FAILED` 支付失败 · `CLOSED` 已关闭 |
| `RefundStatus` | `CREATED` 已受理 · `PROCESSING` 处理中 · `SUCCESS` 退款成功 · `FAILED` 退款失败 · `CLOSED` 已关闭 · `SUSPENDED` 异常挂起（**仍占用退款额度**） |
| `RefundAggregateStatus`（网页视图） | `NONE` 未退款 · `PARTIAL` 部分退款 · `FULL` 全额退款 |
| `PaymentChannel` | 核心取值：`WECHAT` · `ALIPAY` · `UNIONPAY` · `DCEP` · `JD` · `HUAWEI` · `TIKTOK`。枚举存在不代表该渠道能力已验收 |
| `PaymentMethod` | 核心取值：`QR` · `MINI_PROGRAM` · `OFFICIAL_ACCOUNT` · `H5` · `SDK` · `JS` · `MERCHANT_SCAN` · `STATIC_QR` · `POS`。网页直接使用核心取值，不再使用 `NATIVE/JSAPI/APP/MICROPAY` |
| `PaymentSource` | `API`（经开放 API 创建）· `EXTERNAL`（外部收款）**【待核对】** 取值以核心为准 |
| `StoreStatus` | `ACTIVE` · `DISABLED` |
| `AppEnv` | `production` · `sandbox` |
| `AppStatus` | `ACTIVE` · `DISABLED` |
| `ApiKeyStatus` | `ACTIVE` 生效中 · `PENDING` 待生效 · `EXPIRING` 即将失效（轮换过渡期）· `REVOKED` 已吊销 · `EXPIRED` 已过期 |
| `WebhookEventType` | **直接使用核心 `merchant_event` Schema 的 `eventType`**（共 7 个，含 `REFUND.SUSPENDED`）。**【待核对】** 完整取值以锁定 Schema 为准，网页筛选项由该列表生成 |
| `WebhookDeliveryStatus` | `SUCCESS` · `FAILED`（重试耗尽）· `RETRYING` **【待核对】** 以核心通知契约为准 |
| `Granularity` | `day` · `week` · `month` |

#### 核心支付状态 → 网页视图映射

核心 `Payment.status` 包含 `PART_REFUNDED` / `REFUNDED`。网页将其拆为“支付结果”与“退款聚合”两个维度展示，映射如下（单向，仅用于展示与筛选；**Portal 不得据网页 `SUCCESS` 回写或覆盖核心状态**）：

| 核心 status | 网页 `status` | 网页 `refundAggregate` |
| --- | --- | --- |
| `PART_REFUNDED` | `SUCCESS` | `PARTIAL` |
| `REFUNDED` | `SUCCESS` | `FULL` |
| `SUCCESS` | `SUCCESS` | `NONE`（或仅有处理中退款） |
| 其余 | 同名 | `NONE` |

筛选转换：网页筛选 `status=SUCCESS` 转为核心 `status IN (SUCCESS, PART_REFUNDED, REFUNDED)`；**【待核对】** 核心其他状态是否需要映射。网页接口同时返回 `coreStatus` 原值，便于排查。

---

## 3. 数据模型

### 3.1 Payment 支付订单

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 平台支付订单号 |
| `source` | PaymentSource | 订单来源 |
| `merchantOrderNo` | string \| null | 商户订单号；外部收款等场景可为 null |
| `storeId` / `storeName` | string \| null | 所属门店。**【待核对】** `storeName` 需由核心门店主数据关联得到，无合法来源时返回 null |
| `subject` | string | 商品描述 |
| `amount` | AmountFen | 订单金额 |
| `paidAmount` | AmountFen \| null | 实付金额，未支付为 null |
| `channel` | PaymentChannel | |
| `method` | PaymentMethod | |
| `status` | PaymentStatus | 网页视图状态（见第 2 节映射） |
| `coreStatus` | string | 核心原始状态 |
| `createdAt` | string | 创建时间 |
| `submittedAt` | string \| null | 提交渠道时间 |
| `paidAt` | string \| null | 支付成功时间 |
| `closedAt` | string \| null | 关闭时间 |
| `failedAt` | string \| null | 失败时间 |
| `failReason` | string \| null | 失败原因（面向商户） |
| `expireAt` | string \| null | 支付超时时间，可为 null |
| `refundedAmount` | AmountFen | 已退款成功金额（展示用） |
| `refundingAmount` | AmountFen | 占用中的退款金额（`CREATED` + `PROCESSING` + `SUSPENDED`，展示用） |
| `refundAggregate` | RefundAggregateStatus | 由核心状态映射（见第 2 节），不由 Portal 计算 |
| `refundCount` | int | 退款笔数（全部状态） |
| `refundPrincipalLimit` | AmountFen \| null | 核心返回的退款本金上限，未知为 null |
| `availableRefundAmount` | AmountFen \| null | 核心返回的当前可退金额，**未知为 null，前端按“不可退”处理并提示原因** |
| `refundEligibility` | object | 核心退款资格，透传。**【待核对】** 结构以核心 Schema 为准 |
| `collectionVerification` | object \| null | 核心收款核验信息，透传。**【待核对】** |

退款相关金额以核心 `availableRefundAmount` / `refundEligibility` 为准，`refundedAmount` / `refundingAmount` 只用于展示，**不得用于判断能否退款**。

### 3.2 Refund 退款

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 平台退款单号 |
| `merchantRefundNo` | string | 商户退款编号（业务幂等键，作用域以核心契约为准，见 5.3） |
| `paymentId` | string | 原支付订单 |
| `merchantOrderNo` | string \| null | 原订单商户订单号 |
| `storeId` / `storeName` | string \| null | |
| `channel` | PaymentChannel | |
| `amount` | AmountFen | 退款金额 |
| `status` | RefundStatus | |
| `reason` | string | 退款原因 |
| `createdAt` / `updatedAt` | string | |
| `finishedAt` | string \| null | 到达终态时间 |
| `failReason` | string \| null | |
| `progress` | `{ status, at, note? }[]` | 状态流转记录，按时间升序。**【待核对】** 需核心提供状态历史；无来源时返回 `[]`，前端仅展示当前状态 |

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

当前网页对 App 仅提供查询，未提供创建、停用等生命周期管理。**【待确认】** 是否为基础版有意裁剪。

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

`CreatedApiKey` = `ApiKey` + `plainSecret: string`。**明文 Secret 仅在创建/轮换响应中返回一次**，之后任何接口不得再返回。

密钥保存：HMAC 签名/验签需要可用的密钥材料，**只保存不可逆哈希无法满足**。须使用受保护的密钥服务（KMS / 加密存储，Portal 后端不可读明文）。**【待核对】** 多把有效密钥并存时的选择规则、签名中如何标识 `keyId`、密钥管理的归属与权限，均以核心契约为准。

### 3.6 Webhook

`WebhookConfig`：`appId`, `url`, `enabled`, `events: WebhookEventType[]`, `updatedAt: string | null`（从未配置为 null）。

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
| `isTest` | boolean | 是否为测试投递（由投递记录标识，不写入正式事件 Schema） |

投递记录为核心通知历史的只读视图。`url` 等字段须是**该次投递当时的快照**（接收身份、地址、发送内容），不是当前配置。**【待核对】** 字段以核心通知契约为准。

### 3.7 账户

- `Merchant`：`merchantNo`, `name`, `shortName`, `status: ACTIVE | RESTRICTED`, `legalName`, `creditCode`, `industry`, `contactEmail`, `contactPhone`, `address`, `createdAt`
- `CurrentUser`：`id`, `name`, `email`, `phone`, `role`, `lastLoginAt`, `lastLoginIp`。`role` 仅用于展示，**服务端授权不得只依赖此字符串**，须基于成员关系、当前租户与资源范围（见第 7 节）
- `LoginSession`：`id`, `device`, `browser`, `ip`, `location`, `lastActiveAt`, `current: boolean`
- `Captcha`：`captchaId`, `image`（data URL）, `expiresIn`（秒）
- `LoginInput`：`account`, `password`, `captchaId`, `captchaCode`
- `AuthTokens`：`tokenType: "Bearer"`, `accessToken`, `expiresIn`, `refreshToken`, `refreshExpiresIn`；`LoginResult` = `AuthTokens` + `user: CurrentUser`
- `Notification`：`id`, `title`, `description`, `createdAt`, `read`, `level: info | warning | danger`, `link?`（前端路由路径，如 `/payments/pay_xxx`）

---

## 4. 接口清单

| 前端方法 | HTTP |
| --- | --- |
| `auth.captcha()` | `GET /auth/captcha`（无需鉴权） |
| `auth.login(input)` | `POST /auth/login`（无需鉴权） |
| `auth.refresh(refreshToken)` | `POST /auth/refresh`（无需鉴权） |
| `auth.logout(refreshToken)` | `POST /auth/logout` |
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

### 5.0 认证 Auth（Bearer Token）

采用「短时效 access token + 长时效 refresh token」双令牌方案。

| 令牌 | 建议有效期 | 用途 | 服务端要求 |
| --- | --- | --- | --- |
| `accessToken` | 2 小时 | 放在 `Authorization: Bearer` 头访问业务接口 | 签名 JWT（含 `sub`=用户 ID、`mid`=商户号、`sid`=会话 ID、`exp`）或不透明随机串 + 服务端查表均可；校验时须确认所属会话未被吊销 |
| `refreshToken` | 7 天 | 仅用于 `POST /auth/refresh` 换取新令牌 | 不透明随机串，服务端只存哈希；**每次刷新轮换**（旧 refresh token 立即作废），检测到已作废 token 被重放时吊销整个会话 |

每次登录产生一条 `LoginSession`（即 `GET /account/sessions` 列表中的一项），`DELETE /account/sessions/{id}` 与 `POST /account/password` 修改密码后须吊销对应会话（修改密码时吊销除当前会话外的所有会话），其 access token 随即在业务接口上返回 401。

#### `GET /auth/captcha`

响应 `Captcha`：

```json
{ "captchaId": "cap_9f2c...", "image": "data:image/svg+xml;base64,...", "expiresIn": 300 }
```

`image` 为可直接用于 `<img src>` 的 data URL（PNG 或 SVG）。验证码 4 位、不区分大小写、**一次性使用**（无论登录成败，校验后即作废），有效期 `expiresIn` 秒。

#### `POST /auth/login`

请求 `LoginInput`：

```json
{ "account": "ops@example.com", "password": "******", "captchaId": "cap_9f2c...", "captchaCode": "K7QM" }
```

- `account`：登录邮箱或手机号，服务端忽略大小写与首尾空白。
- 校验顺序：参数 → 验证码（`CAPTCHA_INVALID`）→ 锁定状态（`ACCOUNT_LOCKED`）→ 账号密码（`INVALID_CREDENTIALS`）。
- 账号不存在与密码错误必须返回同一错误码与文案，避免枚举账号；同一账号连续失败 5 次锁定 15 分钟，成功登录后清零。另需按 IP 限流（`RATE_LIMITED`）。
- 密码使用 bcrypt / argon2 存储，不得记录到日志。
- 成功时更新 `CurrentUser.lastLoginAt` / `lastLoginIp`，并新建 `LoginSession`。

响应 `LoginResult`（`AuthTokens` + `user`）：

```json
{
  "tokenType": "Bearer",
  "accessToken": "eyJhbGciOi...",
  "expiresIn": 7200,
  "refreshToken": "rt_5b1e...",
  "refreshExpiresIn": 604800,
  "user": { "id": "u_001", "name": "...", "email": "...", "phone": "...", "role": "...", "lastLoginAt": "...", "lastLoginIp": "..." }
}
```

`expiresIn` / `refreshExpiresIn` 单位为秒，前端据此计算本地过期时间。

#### `POST /auth/refresh`

请求 `{ "refreshToken": "rt_5b1e..." }`，响应 `AuthTokens`（不含 `user`，结构同上）。refresh token 无效、过期、已轮换或会话已吊销时返回 `401 UNAUTHENTICATED`，前端清除本地令牌并跳转登录页。

前端行为（供联调参考，统一以此为准）：

1. 业务接口返回 **401** 时自动调用一次 refresh 并重试原请求；refresh 失败则清除令牌并跳转登录页。多个并发请求共享同一次刷新。
2. 该重试成立的前提是服务端保证“401 = 认证阶段拒绝、业务未执行”（见 1.3）。
3. **网络错误、超时、5xx、`UPSTREAM_UNKNOWN` 一律不自动重发**；涉及资金的写操作（如创建退款）结果未知时，按原业务号查询（见 5.3）。

> 认证方案为门户候选设计，需结合 identity 能力与权限模型确认，不代表公共身份包已可用。

#### `POST /auth/logout`

请求头携带当前 access token，请求体 `{ "refreshToken": "rt_5b1e..." }`。服务端吊销该会话（access token 与 refresh token 同时失效），返回 `204`。token 已失效时也返回 `204`，保证幂等；前端无论成败都会清除本地令牌。

### 5.1 工作台 Dashboard

#### 统计口径（工作台、交易统计、门店统计共用）

| 指标 | 口径 |
| --- | --- |
| 支付成功金额/笔数 | 按**支付成功时间 `paidAt`** 落入区间，网页 `status = SUCCESS`（含核心 `PART_REFUNDED/REFUNDED`）。**后续退款不冲减**支付成功统计 |
| 退款金额/笔数 | 按**退款成功时间 `finishedAt`** 落入区间、状态为 `SUCCESS` 的退款单 |
| 订单总数 / 成功率分母 | 按**创建时间 `createdAt`** 落入区间且已到达终态（`SUCCESS + FAILED + CLOSED`）的订单 |

**【待核对】** 报表数据来源（核心实时查询 / 只读报表库）、数据延迟、以及门店/App 数据范围权限过滤。

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
- `processingCount` = 当前 `PAYING` 订单数 + `CREATED/PROCESSING/SUSPENDED` 退款数

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
{
  "paymentId": "pay_xxx",
  "paymentAmount": 10000,
  "refundedAmount": 3000,
  "refundingAmount": 2000,
  "refundPrincipalLimit": 10000,
  "refundableAmount": 5000,
  "eligible": true,
  "ineligibleReason": null
}
```

- `refundableAmount` **透传核心 `availableRefundAmount`**，Portal 不自行用“订单金额 − 已退 − 处理中”计算；核心返回 null 时此处为 null。
- `eligible` / `ineligibleReason` 由核心 `refundEligibility` 映射（**【待核对】** 映射规则）。核心状态为 `PART_REFUNDED` 时仍可能可退，不得因网页状态非 `SUCCESS` 而拒绝。
- 前端：`refundableAmount == null` 或 `eligible == false` 时禁用提交并展示原因，**未知值不得显示为可退**。打开弹窗时实时调用、不用缓存；但该值仅为提示，**最终以提交时核心的再次校验为准**（并发下仍可能被拒）。
- `paymentAmount` / `refundedAmount` / `refundingAmount` 仅用于展示。

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

#### `POST /refunds` → `200 | 201 | 202 Refund`

请求体 `CreateRefundInput`：

```json
{ "paymentId": "pay_xxx", "amount": 5000, "merchantRefundNo": "RF202611020001", "reason": "顾客退货" }
```

**Portal 后端职责（仅限以下）：**

1. 认证；校验当前用户对该订单所属商户/门店有退款权限，否则 `403 FORBIDDEN`；订单不属于当前商户返回 `404 NOT_FOUND`
2. 格式校验：`amount` 为正整数（分），`merchantRefundNo` 去除首尾空格后非空且符合核心格式，`reason` 去空格、为空时默认“商户发起退款”、最长 80 字；否则 `400 VALIDATION`
3. 转调 payment-core 创建退款，并将核心结果按状态码与资源**原样映射**返回

**以下由 payment-core 完成，Portal 不得自行实现或在本地复制**：订单行加锁、退款额度预占与校验（含 `SUSPENDED` 占用、`PART_REFUNDED` 后续退款）、资格判定、Provider 调用与回调、退款状态推进、订单退款金额汇总。核心的拒绝映射为 `INVALID_STATUS` / `EXCEED_REFUNDABLE` / `REFUND_NOT_ELIGIBLE`（**【待核对】** 完整映射）。

**业务幂等（`merchantRefundNo`）：**

| 情况 | 响应 |
| --- | --- |
| 新编号，核心受理 | `201` / `202`（以核心返回为准）+ 当前退款资源 |
| 同编号 + 同业务参数 | `200`（或核心返回的状态码）+ **已有退款资源**，不重复退款 |
| 同编号 + 不同业务参数 | `409 IDEMPOTENCY_CONFLICT` |
| 核心超时 / 结果未知 | `504 UPSTREAM_UNKNOWN` |

- 幂等作用域（商户级 / App 级）与参与比较的字段 **【待核对】**，以核心契约为准；至少包含 `paymentId`、`amount`。
- 前端要求：弹窗打开时生成 `merchantRefundNo` 并在**刷新、重试期间保持不变**；收到 `UPSTREAM_UNKNOWN` 或网络错误时**不得换号重发**，应调用 `GET /refunds?merchantRefundNo=` 查询；查不到时才允许用户以原编号再次提交。
- 成功响应中的 `status` 可能是 `CREATED`、`PROCESSING` 或其他核心当前状态，前端不得假定为 `CREATED`。

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
- 统计口径见 5.1“统计口径”
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

> 门店主数据归 payment-core。以下写操作须**转调核心管理 API**（**【待核对】** 核心端点尚未设计），Portal 不得维护自有可写门店表。下列校验规则为 UI 侧期望，最终以核心为准。

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

> App 主数据归 payment-core；密钥管理的归属、管理契约、权限 **【待核对】**。以下密钥接口为 UI 草案，补齐前仅用于 Mock 联调，不得据此在 Portal 另建密钥体系。

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

### 5.7 Webhook（商户事件通知）

> 通知的发送、重试、确认与历史快照归 payment-core；商户平台只提供**配置、查询、测试入口**，不另建通知引擎。通知配置的管理契约与归属 **【待核对】**。

#### `GET /apps/{appId}/webhook` → `WebhookConfig`

应用未配置过时返回默认值：`{ "appId": "<appId>", "url": "", "enabled": false, "events": [], "updatedAt": null }`，不要返回 404。

#### `PUT /apps/{appId}/webhook` → `WebhookConfig`

```json
{ "url": "https://example.com/pay/notify", "enabled": true, "events": ["<核心 eventType>", "..."] }
```

- `enabled = true` 时 `url` 必须是 `https://` 地址，否则 `VALIDATION`
- 建议拒绝内网/回环地址（SSRF 防护）
- `events` 去重，非法事件返回 `VALIDATION`

#### `POST /apps/{appId}/webhook/test` → `{ httpStatus, durationMs }`

请求核心向已配置地址发送一次**测试通知**，超时 5 秒。未配置地址或未启用时返回 `VALIDATION`。对方返回非 2xx 时**仍返回 200**，由 `httpStatus` 体现；连接失败时返回 `httpStatus: 0`。

测试通知须有**独立且明确的测试语义**（例如独立的测试事件类型或独立的测试通道，投递记录 `isTest = true`），**不得向正式业务事件 Schema 塞入 `test` 字段**，也不得伪造真实订单数据。**【待核对】** 具体形式以核心通知契约为准。

#### `GET /webhook-deliveries` → `Paginated<WebhookDelivery>`

参数：`keyword`（匹配 `eventId`、`resourceId`）、`eventType`、`status`；按 `lastAttemptAt` 降序。

#### `GET /webhook-deliveries/by-resource/{resourceId}` → `WebhookDelivery[]`

返回某支付订单或退款单相关的全部投递记录，用于详情页展示。

#### 对外推送协议（payment-core → 商户）

**本节不是本协议的规范内容，以核心锁定的 `merchant_event` Schema 与通知契约为准。** 已知约束：

- 事件信封字段：`eventId`、`eventType`、`eventVersion`、`occurredAt`、`aggregateVersion`、`data`；`data` 为**受约束的事件快照**，不是任意 Portal `Payment` / `Refund` 对象。
- 事件类型共 7 个，含 `REFUND.SUSPENDED`；网页筛选与配置使用同一套取值，如需展示别名须做显式映射。
- 每次投递须固定**当时的**接收身份、地址、发送字节与签名，形成历史快照；不能用“当前有效 API Secret”或当前配置回推历史投递规则。

**【待核对】**（本仓库没有完整的权威通知契约，以下事项不得据本草案实现）：签名算法与签名头、签名所用密钥及 `keyId` 标识、ACK 判定、重试间隔与次数、`errorSummary` 截取规则。开发者中心“签名验证”页面的示例代码同样待核对后更新。

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
2. 统一处理错误：非 2xx 时解析响应体并 `throw new ApiError(body.message, body.code)`；401 的刷新与跳转规则见 5.0（`withAuth.ts` 已实现），其他错误不自动重试
3. 在 `src/services/api/index.ts` 中将 `mockApi` 替换为 `httpApi`（可用 `import.meta.env.VITE_USE_MOCK` 切换）

接入真实后端前，须先完成第 8 节中的前端改造项。

---

## 7. 需求缺口（实现前需补齐）

| 缺口 | 说明 |
| --- | --- |
| 组织与成员 | 既定的组织/成员管理入口未覆盖；登录用户与商户的成员关系、当前租户、服务端资源授权需明确，不能只靠 `role` 字符串 |
| 多组织 | 若一个用户可属于多个商户，需设计租户切换流程与 token 中的租户标识 |
| 角色权限矩阵 | 各角色对页面、操作（退款、密钥、通知配置、门店编辑）的权限，以及门店 / App 数据范围 |
| 账单下载 | 正式账单下载未覆盖，交易 CSV 导出**不能替代**正式账单 |
| App 生命周期 | 当前仅查询，需确认是否为基础版有意裁剪 |
| 核心管理 API | 门店 / App / 密钥 / 通知配置的写操作所需核心端点清单 |
| Portal ↔ 核心映射 | 字段映射、状态映射、错误码映射表 |
| 报表 | 数据来源、延迟、权限过滤 |

## 8. 前端现状与本协议的差异（待改造）

当前前端与 Mock 按 v1 草案实现，以下差异需在核心契约确认后改造，**改造前前端不可直接对接真实后端**：

| 项 | 前端现状 | 目标 |
| --- | --- | --- |
| 退款可退金额 | Mock 以“订单金额 − 已退 − 处理中”计算，未计入 `SUSPENDED`，仅 `SUCCESS` 可退 | 使用核心 `availableRefundAmount` / 资格，未知按不可退 |
| 退款幂等 | 重复编号返回 `DUPLICATE`；成功固定 `CREATED` | 同号同参返回已有资源；不同参数 `IDEMPOTENCY_CONFLICT`；超时按原号查询 |
| 支付状态 | 无 `coreStatus`，不处理 `PART_REFUNDED/REFUNDED` | 按第 2 节映射 |
| 渠道 / 方式 | 仅 3 个渠道，方式为 `NATIVE/JSAPI/APP/MICROPAY` 等 | 使用核心取值，未知值展示原值 |
| 可空字段 | `merchantOrderNo`、`expireAt`、`storeName` 视为必有；无 `source` | 按第 3 节可空处理，支持 `EXTERNAL` |
| Webhook 事件 | 小写 6 事件；测试推送带 `test: true` | 核心 7 事件；独立测试语义，`isTest` |
| 签名验证文档页 | 展示 v1 草案签名算法与重试策略 | 待核心通知契约确认后更新 |
| 金额 | 整数分 `number` | 依 1.1 方案决策 |
