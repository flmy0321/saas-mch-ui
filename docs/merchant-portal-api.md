# 商户后台（Merchant Portal）网页接口协议 v1.3（候选草案）

> **文档状态：候选草案，可作为前端改造方向；尚不是后端联调验收依据，也不是内部服务契约冻结。** 已根据《UI 协议核查结果》（2026-11-03）、《v1.1 复核与修订意见》（2026-11-04）与《v1.2 复核结果及最后补充清单》（2026-11-04）修订。标记为 **【待核对】** 的条目依赖尚未设计的**支付领域内部能力契约**或核心锁定 Schema / 通知契约，在契约补齐前不得自行定义实现。**本版只修订文档；前端类型、Mock 与页面仍为旧版实现（`MerchantApi.auth` 注释除外），差异见第 8 节。**

本文档描述商户后台前端（Portal）所依赖的网页接口。它与 `src/services/api/types.ts`、`src/types/index.ts` 的对应关系**只用于保证 UI 草案内部一致**，不能凌驾于已锁定的跨系统规则；两者与核心规则冲突时，以核心规则为准，并同步修改本文档与前端代码。

> **架构限制（已确认）：禁止开放 API 用于门户；允许独立内部接口。** 调用链为：浏览器 → merchant-platform 独立网页接口（本文）→ 另行设计的支付领域内部接口 → 核心资金领域。
>
> - 本文网页接口是**独立契约**：成功响应、数据模型与错误码由 Portal 独立规范化，不要求与开放 API 的 HTTP 状态、字段、错误码一致，也**不原样透传**核心或开放 API 的响应。规范化时须保留真实业务状态、结果是否确定的语义与关联号（如 `requestId`、业务单号）。
> - 内部接口不是开放 API 改前缀，**不得使用商户开放 API Secret 冒充用户授权**；须携带服务身份、租户、操作者、权限/资源范围及审计上下文，由核心校验可信范围与资金约束。具体协议、部署单元、端点、版本与鉴权实现**尚未确定**。
> - 核心资金规则与 Schema 是**语义参考**。Portal 不得复制退款状态机、额度预占、Provider 调用或通知引擎；内部查询可使用授权只读投影，不得跨库直写。

---

## 0. 职责边界

| 能力 | 归属 | 商户平台（Portal 后端）职责 |
| --- | --- | --- |
| 支付/退款资金事务、退款额度预占、Provider 回调、状态推进 | payment-core | 权限校验、参数适配、调用**独立内部能力契约（待设计）**、规范化后展示。**不直写核心库，不在本地保存可写资金状态副本** |
| 退款额度与退款资格判定 | payment-core | 以内部能力返回的权威值为准（经显式映射），不自行计算裁决 |
| 商户事件通知的发送、重试、确认、历史快照 | payment-core | 提供配置、查询、测试入口；不另建通知引擎 |
| 门店 / App 主数据 | payment-core | 提供管理入口，写操作调用独立内部能力契约（待设计）；不另建第二份可写主数据 |
| 密钥、通知配置的管理 | **【待核对】** 归属、内部管理契约与权限尚未定义 | 补齐前仅按本文 UI 草案联调 Mock |
| 身份、组织成员、网页会话、门户偏好 | 商户平台 / identity 等对应领域 **【待核对】** | 由对应领域负责，**不要求转调核心**；见 5.0、7 |

支付领域内部能力契约尚未设计。本文第 4、5 节列出的是 **Portal 网页接口**，不代表内部端点；Portal → 内部能力的调用与字段映射须在内部契约设计后补充，不得臆造。本轮不实施 payment-core 变更。

---

## 1. 通用约定

### 1.1 基础信息

| 项目 | 约定 |
| --- | --- |
| Base URL | `/api/portal/v1`（与前端同域，或通过网关反向代理） |
| 协议 | HTTPS，`Content-Type: application/json; charset=utf-8` |
| 鉴权 | Bearer Token：仅 `GET /auth/captcha`、`POST /auth/login`、`POST /auth/refresh` 无需 access token；其余所有接口（**含 `POST /auth/logout`**）须携带 `Authorization: Bearer <accessToken>`，详见 5.0。商户维度由 token 对应的用户确定，**任何请求参数都不得用于切换商户** |
| CSRF | 不使用 Cookie 鉴权，因此无需 CSRF Token；服务端不得从 Cookie 读取凭证 |
| CORS | 如前后端不同域，仅放行商户后台域名，允许 `Authorization` 请求头，不要使用 `Access-Control-Allow-Origin: *` |
| 字段命名 | JSON 字段使用 lowerCamelCase |
| 时间 | ISO 8601 UTC 字符串，如 `2026-11-02T08:30:00.000Z`；前端按浏览器时区展示 |
| 日期参数 | 查询参数中的日期区间使用 `YYYY-MM-DD`，按商户时区（Asia/Shanghai）解释，`from` 取当日 00:00:00，`to` 取当日 23:59:59.999 |
| 金额 | `AmountDecimal`：十进制字符串，单位元，见下方“金额约定”（推荐方案，**待用户单独确认**） |
| 比率 | `0 ~ 1` 的小数，如成功率 `0.9731`；同比/环比为相对变化，如 `0.12` 表示 +12%，`-0.05` 表示 -5% |
| 可空字段 | 明确返回 `null`，不要省略字段 |
| ID | 字符串，前端不解析其结构 |
| 未知枚举值 | 服务端可能返回本文未列出的枚举值（核心新增渠道、方式、状态），前端必须原样展示为“未知(原值)”，不得报错或归入其他取值 |

#### 金额约定（`AmountDecimal`）

本轮采用审查建议的**方案 A**（推荐方案，尚无用户对金额选型的单独确认，确认前前端仍为旧版整数分实现）：

| 项 | 约定 |
| --- | --- |
| 类型 | `AmountDecimal = string`，单位**元**。输出与输入分别定义格式（见下两行） |
| 输出格式 | 服务端输出**恰好两位小数**，非负：正则 `^(0|[1-9]\d*)\.\d{2}$`，如 `"128.00"`、`"0.01"`、`"0.00"`。可空金额返回 `null`，不返回空字符串 |
| 输入格式 | 浏览器提交的金额允许 0~2 位小数：正则 `^(0|[1-9]\d*)(\.\d{1,2})?$`（如 `"50"`、`"50.5"`、`"50.50"`），服务端规范化为两位小数后参与比较；不允许正负号、千分位、科学计数法、首尾空格；不符返回 `VALIDATION`，**不做四舍五入或截断** |
| 符号 | 支付金额、退款金额、可退金额、统计合计均**非负**；退款请求金额须**严格大于 0**。带符号金额（`-` 前缀）仅在确有业务含义的字段中使用，且须在字段处单独声明；本版无此类字段 |
| 统计合计 | 同为十进制字符串，后端以十进制类型累加。精度与取值范围 **【待核对】**（按内部契约约定的 precision/scale），超出约定范围返回错误并告警，不得截断或返回近似值，**不称“无上限”** |
| 前端运算 | 金额比较、加减、校验使用十进制库或基于字符串的整数分换算；**不得用 `Number` / `parseFloat` 做金额运算，也不得用字符串字典序比较金额**（如 `"9.00" > "10.00"` 为真）。图表绘制可派生近似数值，但仅用于绘制，展示与提示仍用原字符串 |
| 导出 | CSV 金额列为元字符串（见 5.2） |

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
| 401 | `UNAUTHENTICATED` | **仅表示浏览器会话认证失败**：未携带 token、token 无效/过期/已吊销。**服务端必须在执行任何业务逻辑之前完成认证**，保证返回 401 时请求未产生副作用；前端据此刷新令牌并重试一次（见 5.0）。**Portal 调用内部能力时的服务鉴权失败、依赖不可用等不得映射为 401**（应映射为 5xx 并保留结果确定性语义），以免触发前端自动刷新重试资金写操作 |
| 400 | `CAPTCHA_INVALID` | 登录验证码错误或已过期（验证码一次性使用） |
| 401 | `INVALID_CREDENTIALS` | 账号或密码错误，`message` 可带剩余尝试次数 |
| 423 | `ACCOUNT_LOCKED` | 连续登录失败过多，账号临时锁定 |
| 403 | `FORBIDDEN` | 已登录但无该操作权限 |
| 404 | `NOT_FOUND` | 资源不存在，**或不属于当前商户**（不要用 403 泄露资源存在性） |
| 409 | `DUPLICATE` | 唯一键冲突（仅商户门店编号等主数据唯一键）。**不用于商户退款编号** |
| 409 | `IDEMPOTENCY_CONFLICT` | 同一商户退款编号已用于不同业务参数的退款（见 5.3） |
| 409 | `INVALID_STATUS` | 当前状态不允许该操作 |
| 409 | `EXCEED_REFUNDABLE` | 退款金额超过核心判定的可退金额（由内部能力校验后映射） |
| 409 | `REFUND_NOT_ELIGIBLE` | 核心判定该订单当前不具备退款资格（`refundEligibility`），`message` 为规范化后的面向商户原因 |
| 502 / 504 | `UPSTREAM_UNKNOWN` | 调用内部能力超时或结果未知。**资金结果未确定**，前端不得自动重发，进入待确认状态（见 5.3） |
| 503 | `UPSTREAM_UNAVAILABLE` | 内部能力不可用。**HTTP 503 本身不证明未受理**：仅当内部能力权威地声明“确定未受理”时，响应体才附 `outcome: "NOT_ACCEPTED"`；否则对资金写操作一律按结果未知处理 |
| 409 | `APP_DISABLED` | 应用已停用 |
| 400 | `INVALID_PASSWORD` | 当前密码不正确 |
| 429 | `RATE_LIMITED` | 请求过于频繁 |
| 500 | `INTERNAL` | 服务端异常 |

涉及资金写操作的错误响应体额外包含 `outcome` 字段：`"REJECTED"`（确定未执行，如校验/资格/额度拒绝）、`"NOT_ACCEPTED"`（内部能力权威声明未受理）、`"UNKNOWN"`（结果未确定）。前端仅依据 `outcome` 判断结果是否确定，不依据 HTTP 状态码推断。

对资金写操作，以下情况前端一律按 `outcome: "UNKNOWN"` 处理：网络异常/超时/连接中断；代理或网关返回非 JSON 响应体；响应体解析失败；`outcome` 缺失或为本文未列出的值；HTTP 2xx 但响应体不是合法 `Refund` 资源。**响应解析失败不得清除恢复记录**（见 5.3）。

`outcome` 只描述**本次请求**的结果，不描述该业务号历史上其他请求的结果（见 5.3 R2）。

**【待核对】** 内部能力错误 → 网页错误码的映射表待内部契约设计后补充；映射前不得把未知内部错误统一映射为 `VALIDATION`，也不得映射为 `UNAUTHENTICATED`。

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

筛选转换：网页筛选 `status=SUCCESS` 转为核心 `status IN (SUCCESS, PART_REFUNDED, REFUNDED)`；**【待核对】** 核心其他状态是否需要映射。网页接口同时返回 `coreStatus` 原值，便于排查。网页状态拆分仅用于展示，不回写核心。

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
| `amount` | AmountDecimal | 订单金额 |
| `paidAmount` | AmountDecimal \| null | 实付金额，未支付为 null |
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
| `refundedAmount` | AmountDecimal | 已退款成功金额（展示用） |
| `refundingAmount` | AmountDecimal | 占用中的退款金额（`CREATED` + `PROCESSING` + `SUSPENDED`，展示用） |
| `refundAggregate` | RefundAggregateStatus | 由核心状态映射（见第 2 节），不由 Portal 计算 |
| `refundCount` | int | 退款笔数（全部状态） |
| `refundPrincipalLimit` | AmountDecimal \| null | 核心返回的退款本金上限，未知为 null |
| `availableRefundAmount` | AmountDecimal \| null | 核心返回的当前可退金额，**未知为 null，前端按“不可退”处理并提示原因** |
| `refundEligibility` | RefundEligibility \| string \| null | 退款资格，**字符串枚举**，沿用锁定 Payment Schema 语义（见下）。服务端无法取得权威资格时返回 `null`（字段不省略） |
| `collectionVerification` | CollectionVerification \| string \| null | 收款核验状态，**字符串枚举**，沿用锁定 Schema 语义（见下）；不适用时为 null |

`RefundEligibility`：`NOT_COLLECTED` 未确认收款 · `REVIEW_REQUIRED` 待人工复核 · `RULE_UNVERIFIED` 退款规则未核实 · `BLOCKED` 已阻断 · `EXHAUSTED` 额度已用尽 · `ALLOWED` 允许退款。

`CollectionVerification`：`PENDING` 核验中 · `VERIFIED` 已核验 · `REVIEW_REQUIRED` 待复核。

- 本版**直接沿用上述字符串语义**，不另建结构。若后续 Portal DTO 改为结构化对象，须在本文给出显式映射表，不得声称透传。
- **资金资格展示条件**（必要非充分）：`refundEligibility === "ALLOWED"` **且** `availableRefundAmount` 非 null、格式合法且大于 `"0.00"`。其余情况（含 `null`、字段缺失、坏值、未知枚举值）一律按不可退处理，并提示“待核实/不可退”原因。
- **前端开放提交须同时满足**（全部为真才可点击提交）：
  1. 满足上述资金资格展示条件（以打开弹窗时实时取得的 5.2 `RefundableInfo` 为准）；
  2. 当前用户具有该订单的退款操作权限（权限来源见第 7 节，未定前按服务端 403 处理）；
  3. 当前用户/租户/订单**不存在待确认（UNKNOWN）或可能已发送的本地退款操作**（见 5.3 R3）——**无论可退余额是否仍足够**，待确认期间禁止从此入口另建退款；
  4. 不处于提交中；
  5. 输入金额符合 1.1 输入格式、大于 0、且不超出当前提示的可退金额（十进制比较）。
- 以上为防误操作的前端约束，**服务端必须独立授权并以核心原子校验为准**；前端校验通过不代表可退。
- `refundedAmount` / `refundingAmount` 只用于展示，**不得用于判断能否退款**。

### 3.2 Refund 退款

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 平台退款单号 |
| `merchantRefundNo` | string | 商户退款编号（业务幂等键，作用域以核心契约为准，见 5.3） |
| `paymentId` | string | 原支付订单 |
| `merchantOrderNo` | string \| null | 原订单商户订单号 |
| `storeId` / `storeName` | string \| null | |
| `channel` | PaymentChannel | |
| `amount` | AmountDecimal | 退款金额 |
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

`CreatedApiKey` = `ApiKey` + `plainSecret: string`。**明文 Secret 仅在创建/轮换的授权响应中返回一次**，之后任何接口不得再返回。

明文约束需区分两件事：

- **允许**：一次性创建结果经授权的创建/轮换响应传递给当前操作用户（可经 Portal 后端转发）。
- **禁止**：Portal 持久化明文、在日志/审计/错误信息/监控中记录明文、事后再次取回明文、以及 Portal 日常持有解密权限。

密钥保存：HMAC 签名/验签需要可用的密钥材料，**只保存不可逆哈希无法满足**，须使用受保护的密钥服务（KMS / 加密存储）。**【待核对】** 多把有效密钥并存时的选择规则、签名中如何标识 `keyId`、密钥生命周期（过渡期时长、并存数量上限）、管理归属与权限，均以权威内部管理契约为准。

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

投递记录为核心通知历史的只读视图。`url` 等字段须是**历史快照**（接收身份、地址、发送的事件字节），不是当前配置。每次尝试的时间戳与签名材料是否固定、是否每次重签，依内部通知权威契约确定，本文不作要求。**【待核对】** 字段以核心通知契约为准。

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
| `refunds.findByMerchantRefundNo(paymentId, merchantRefundNo)` | `GET /refunds/by-merchant-refund-no/{merchantRefundNo}?paymentId=`（精确查询，见 5.3） |
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

1. 业务接口返回 **`401 UNAUTHENTICATED`** 时自动调用一次 refresh 并重试原请求；refresh 失败则清除令牌并跳转登录页。多个并发请求共享同一次刷新。其他 401 code（如 `INVALID_CREDENTIALS`）不触发刷新。
2. 该重试成立的前提是服务端保证“401 = 浏览器会话认证阶段拒绝、业务未执行”，且**内部依赖鉴权失败不会被映射为 401**（见 1.3）。
3. **网络错误、超时、5xx、`UPSTREAM_UNKNOWN` 一律不自动重发**；涉及资金的写操作（如创建退款）结果未知时，进入待确认状态（见 5.3）。
4. HTTP 适配层须完整保留 HTTP 状态、`code`、`outcome`、`requestId`，不得把非认证错误折叠为会话失效。

> 认证方案为门户候选设计，需结合 identity 能力与权限模型确认，不代表公共身份包已可用。

#### `POST /auth/logout`

请求头携带当前 access token，请求体 `{ "refreshToken": "rt_5b1e..." }`。服务端吊销该会话（access token 与 refresh token 同时失效），返回 `204`。token 已失效时也返回 `204`，保证幂等；前端无论成败都会清除本地令牌。

### 5.1 工作台 Dashboard

#### 统计口径（工作台、交易统计、门店统计共用）

两类指标使用**不同的订单集合**，不得交叉相除：

| 指标 | 集合 | 口径 |
| --- | --- | --- |
| `successAmount` / `successCount` | 集合 P：`paidAt` 落入区间 | 网页 `status = SUCCESS`（含核心 `PART_REFUNDED/REFUNDED`）。**后续退款不冲减**支付成功统计 |
| `refundAmount` / `refundCount` | 集合 R：退款 `finishedAt` 落入区间 | 状态为 `SUCCESS` 的退款单 |
| `totalCount` | 集合 C：`createdAt` 落入区间 | **区间内创建的订单总数**（任何状态） |
| `terminalCount` | 集合 C 的子集 | 其中已到达终态（网页 `SUCCESS + FAILED + CLOSED`，`SUCCESS` 含已退款） |
| `createdSuccessCount` | 集合 C 的子集 | 其中网页 `status = SUCCESS`（含已退款） |
| `successRate` | 集合 C | `createdSuccessCount / terminalCount`；`terminalCount = 0` 时为 `0` |

- 不得以集合 P 的 `successCount` 除以集合 C 的 `terminalCount`。
- 所有报表响应（`/dashboard/summary`、`/dashboard/trend`、`/dashboard/channel-share`、`/analytics`、`/stores/{id}/stats`）均为对象并在顶层返回 `asOf`（ISO 8601，数据截止时间），用于展示数据延迟；列表型报表统一为 `{ asOf, items }` 或明确命名的数组字段，**不直接返回裸数组**。`/dashboard/recent-payments` 为业务列表，不属于报表，不带 `asOf`。
- 比较值（同比/环比）分母为零时返回 `null`，**不得产生 `Infinity` / `NaN`**；前端展示为“—”。
- 金额合计为 `AmountDecimal`。

**【待核对】** 报表数据来源（内部实时查询 / 授权只读投影）、数据延迟、以及门店/App 数据范围权限过滤。

#### `GET /dashboard/summary` → `DashboardSummary`

“今日”按商户时区自然日计算，`compare` 为与昨日同时段的相对变化。

```json
{
  "asOf": "2026-11-04T06:30:00.000Z",
  "todaySuccessAmount": "128734.00",
  "todaySuccessCount": 1532,
  "todayRefundAmount": "2300.00",
  "todayRefundCount": 12,
  "todayTotalCount": 1620,
  "todayTerminalCount": 1574,
  "todayCreatedSuccessCount": 1531,
  "todaySuccessRate": 0.9727,
  "processingCount": 8,
  "compare": { "successAmount": 0.12, "successCount": 0.08, "refundAmount": -0.05, "refundCount": null, "successRate": 0.004 }
}
```

- `todaySuccessRate` 按上表集合 C 计算
- `compare.*` 为 `number | null`，昨日同时段分母为 0 时为 `null`
- `processingCount` = 当前 `PAYING` 订单数 + `CREATED/PROCESSING/SUSPENDED` 退款数

#### `GET /dashboard/trend?days=7|30` → `{ asOf, points: TrendPoint[] }`

按日返回最近 `days` 天（含今天），无数据的日期也要返回 0 值点。

`TrendPoint`：`date (YYYY-MM-DD)`, `successAmount: AmountDecimal`, `successCount`, `refundAmount: AmountDecimal`, `refundCount`, `totalCount`, `terminalCount`, `createdSuccessCount`, `successRate`。`date` 为唯一 key，前端显示格式自行派生。

#### `GET /dashboard/channel-share?days=` → `{ asOf, items: ChannelShare[] }`

`ChannelShare`：`{ channel, amount: AmountDecimal, count }`，基于集合 P（`paidAt` 落入区间的支付成功订单），按 `amount` 降序；`channel` 可为未知枚举值。

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
  "paymentAmount": "100.00",
  "refundedAmount": "30.00",
  "refundingAmount": "20.00",
  "refundPrincipalLimit": "100.00",
  "refundableAmount": "50.00",
  "refundEligibility": "ALLOWED",
  "ineligibleReason": null,
  "asOf": "2026-11-04T06:30:00.000Z"
}
```

- `refundableAmount` 来自内部能力返回的权威可退金额（对应核心 `availableRefundAmount` 语义，经显式映射），Portal 不自行用“订单金额 − 已退 − 处理中”计算；未知时为 null。
- `refundEligibility` 为 3.1 定义的字符串枚举；`ineligibleReason` 为面向商户的中文说明，`ALLOWED` 时为 null。核心状态为 `PART_REFUNDED` 时仍可能可退，不得因网页状态非 `SUCCESS` 而拒绝。
- `refundEligibility` 与 `refundableAmount` 均可为 `null`（无法取得权威值），字段不省略；前端遇到 `null`、缺失、格式非法或未知枚举时一律保守禁用。
- 前端：`refundEligibility === "ALLOWED"` 且 `refundableAmount` 非 null 且大于 `"0.00"` 只是**资金资格展示条件**，开放提交还须满足 3.1 列出的全部条件（权限、无待确认操作、非提交中、输入合法且不超额）。其他情况禁用并提示“待核实/不可退”，**未知值不得显示为可退**。打开弹窗时实时调用、不用缓存；该值仅为提示，**最终以提交时核心的原子校验为准**（并发下仍可能被拒）。
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
{ "paymentId": "pay_xxx", "amount": "50.00", "merchantRefundNo": "RF202611020001", "reason": "顾客退货" }
```

**Portal 后端职责（仅限以下）：**

1. 认证；校验当前用户对该订单所属商户/门店有退款权限，否则 `403 FORBIDDEN`；订单不属于当前商户返回 `404 NOT_FOUND`
2. 格式校验：`amount` 符合 1.1 **输入格式**且严格大于 0，`merchantRefundNo` 去除首尾空格后非空且符合约定格式，`reason` 去空格、为空时默认“商户发起退款”、最长 80 字；否则 `400 VALIDATION`（`outcome: "REJECTED"`）
3. 携带服务身份、租户、操作者、权限范围与审计上下文，调用**独立内部能力契约（待设计）**创建退款；将结果**规范化**为本文的 `Refund` 资源与错误码，保留真实业务状态、结果确定性（`outcome`）与关联号，不原样透传内部状态码

**以下由 payment-core 完成，Portal 不得自行实现或在本地复制**：订单行加锁、退款额度预占与校验（含 `SUSPENDED` 占用、`PART_REFUNDED` 后续退款）、资格判定、Provider 调用与回调、退款状态推进、订单退款金额汇总。确定性拒绝映射为 `INVALID_STATUS` / `EXCEED_REFUNDABLE` / `REFUND_NOT_ELIGIBLE`（**【待核对】** 完整映射）。

**业务幂等（`merchantRefundNo`）：**

| 情况 | 响应 |
| --- | --- |
| 新编号，已受理 | `201` / `202` + 当前退款资源 |
| 同编号 + 同业务参数 | `200` + **已有退款资源**，不重复退款 |
| 同编号 + 不同业务参数 | `409 IDEMPOTENCY_CONFLICT`（`outcome: "REJECTED"`，**仅指本次冲突请求未产生新退款**，见 R2） |
| 确定性业务拒绝 | `409` + 对应 code（`outcome: "REJECTED"`） |
| 超时 / 结果未知 / 不可用但未权威声明未受理 | `502 / 503 / 504` + `outcome: "UNKNOWN"` |

- 幂等作用域（商户级 / App 级）与参与比较的字段 **【待核对】**，以内部契约为准；至少包含 `paymentId`、`amount`。在决定前，前端类型与 Mock **不得默认 `merchantRefundNo` 在商户内全局唯一**（见 R4）。
- 成功响应（`200/201/202`）只表示请求已受理或已定位到原退款资源，**不表示资金已退成功**；前端按资源 `status` 展示（可能是 `CREATED`、`PROCESSING`、`SUSPENDED`、`SUCCESS`、`FAILED` 或未知值），不得把 HTTP 成功当作退款成功，也不得假定为 `CREATED`。

**R1 提交条件**：见 3.1“前端开放提交须同时满足”。资金资格只是必要条件之一；任何待确认操作存在时，此入口禁止另建退款。服务端独立授权并以核心原子校验为准。

**R2 结果确定性的作用范围（`REJECTED` 不清除原号的未知状态）：**

1. `outcome` 只描述**本次请求**。某业务号一旦出现过 `UNKNOWN`（或可能已发送但无响应），该业务号即处于“待确认”，**后续任何请求的确定性拒绝都不得覆盖它**，除非权威恢复协议明确证实原操作**未受理**（`NOT_ACCEPTED`）或精确查询定位到原退款资源。
2. 典型情形：同号不同参 `IDEMPOTENCY_CONFLICT` 只证明冲突请求未产生新退款，原编号可能已对应一笔已受理、处理中甚至成功的退款；认证失败（401）、权限变化（403）、参数校验失败（400）、资格/额度拒绝（409）同理。前端收到这些响应时**保留原恢复上下文**，转为按原号精确查询并核对原资源，**不得据此标记“确定未执行”、不得生成新编号**。
3. 精确查询找到退款资源时，结果视为“已定位”：将恢复上下文更新为该资源并按其 `status` 展示，但**不表示资金成功**。如需再发起一笔新的正常退款，须重新调用 5.2 取得权威可退资格；**UI 不以本地记录释放或扣减额度**。
4. 只有“从未发送”的草稿被确定性拒绝（首次请求即收到 `REJECTED` 且该号此前无任何未知记录）时，才可视为该号未执行，并允许用户修改参数后**以新编号**重新提交。

**R3 恢复上下文：先保存，再发送（前端）：**

1. 生成 `merchantRefundNo` 后、**发出首次 `POST /refunds` 之前**，先持久化恢复上下文：`userId`、租户（商户号）、`paymentId`、作用域信息（见 R4）、`merchantRefundNo`、完整请求参数（`amount` 规范化值、`reason` 规范化值）、`createdAt`、`phase`。
2. `phase` 取值：
   - `DRAFT`：已生成编号、尚未发送。可修改参数（编号不变）或丢弃；
   - `SENT_PENDING`：已开始发送、尚未得到确定结果（含无响应、刷新中断、解析失败、`UNKNOWN`）。**不得修改参数、不得换号、不得自动重发**；
   - `LOCATED`：已定位到退款资源（记录 `refundId` 与最近 `status`）；
   - `REJECTED_DRAFT`：仅适用于 R2 第 4 条情形；
   - `NOT_ACCEPTED`：权威恢复协议确认未受理，允许**同号同参**重新提交。
3. 写入 `SENT_PENDING` **必须在请求发出之前完成**；任何异常路径（含 JSON 解析失败）都不得删除该记录。
4. 恢复 `SENT_PENDING` 时**先查询、不自动重发**：调用精确查询；未定位到资源时继续展示“待确认”，由用户手动刷新确认。
5. 连点、重复打开弹窗、刷新页面不得生成新编号：同一 `userId + 租户 + paymentId` 存在未结束（`DRAFT`/`SENT_PENDING`/`NOT_ACCEPTED`）的上下文时，复用它。
6. 多标签页：恢复上下文须存放于同源共享存储（如 `localStorage`，按 `userId + 租户` 命名空间隔离），并通过 `storage` 事件或 `BroadcastChannel` 同步；另一标签页存在 `SENT_PENDING` 时，本页同样进入“待确认”并禁止新建。**不得只依赖组件内 `loading` 状态防重**。
7. 浏览器记录是防误操作辅助，**不是服务端资金锁**；服务端幂等与额度约束必须独立成立。退出登录时可保留该记录（按用户隔离），重新登录同一用户后恢复。
8. 只有 `LOCATED` 且资源处于终态，或 `REJECTED_DRAFT` 时，才允许用户结束该上下文并开始一笔新的退款（生成新编号）。

**R4 精确查询的作用域必须与创建一致：**

- 创建请求以 `paymentId` 为入口；精确查询**同样以 `paymentId` 限定作用域**：`GET /refunds/by-merchant-refund-no/{merchantRefundNo}?paymentId=`（必填）。
- Portal 后端由 `paymentId` 解析所属商户与 App（若幂等作用域最终为 App 级），在该作用域内按编号精确匹配；浏览器不传、也不能指定 App 或商户。这样无论作用域最终为商户级还是 App 级，查询都与创建一致。
- 返回的退款资源 `paymentId` 必须与请求一致；不一致时前端视为异常，保持“待确认”并提示联系客服，不据此开放新建。
- 恢复上下文按 R3 保存 `paymentId`，不另存 App ID 作为查询参数。

#### `GET /refunds/by-merchant-refund-no/{merchantRefundNo}?paymentId=` → `Refund`

在 `paymentId` 所确定的幂等作用域内按商户退款编号**精确匹配**（见 R4），用于结果未知时的确认。缺少 `paymentId` 返回 `400 VALIDATION`；订单不存在或不属于当前商户返回 `404 NOT_FOUND`。

- 找到时返回该退款资源（`200`）。找到资源仅表示“已定位”，按资源 `status` 展示。
- 找不到时返回 `404 NOT_FOUND`，响应体附 `authoritative: boolean`：为 `true` 仅表示查询直接命中权威数据源且在约定一致性窗口外，**仍不等于确定未受理**；前端据此只调整提示文案，不开放重新提交。`404` 响应中订单不存在与编号不存在使用不同 `code`（`PAYMENT_NOT_FOUND` / `REFUND_NOT_FOUND`）**【待核对】**。
- 一致性说明（读写一致 / 最终一致及延迟上限）**【待核对】**。列表接口 `GET /refunds?merchantRefundNo=` 的模糊/包含匹配**不得**用作恢复依据。

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
  "asOf": "2026-11-04T06:30:00.000Z",
  "totals": { "successAmount": "0.00", "successCount": 0, "refundAmount": "0.00", "refundCount": 0, "totalCount": 0, "terminalCount": 0, "createdSuccessCount": 0, "successRate": 0, "avgAmount": "0.00" },
  "buckets": [{ "key": "2026-11-02", "start": "2026-11-02", "end": "2026-11-02", "label": "11-02", "successAmount": "0.00", "successCount": 0, "refundAmount": "0.00", "refundCount": 0, "totalCount": 0, "terminalCount": 0, "createdSuccessCount": 0, "successRate": 0, "avgAmount": "0.00" }],
  "byChannel": [{ "channel": "WECHAT", "amount": "0.00", "count": 0 }],
  "byStore": [{ "storeId": "st_1", "storeName": "旗舰店", "amount": "0.00", "count": 0 }]
}
```

- `buckets` 连续无缺口，首尾桶按 `from`/`to` 截断
- `key`：桶的唯一完整日期 key（day 为 `YYYY-MM-DD`；week 为该周在区间内第一天 `YYYY-MM-DD`；month 为 `YYYY-MM`），**跨年区间也不重复**；`start` / `end` 为桶覆盖的实际日期
- `label` **仅用于展示**（day `MM-DD`、week `MM-DD 周`、month `YYYY-MM`），前端不得以 `label` 作为 key 或排序依据
- `avgAmount` = `successAmount / successCount`，十进制计算后四舍五入到两位小数，笔数为 0 时为 `"0.00"`
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
{ "asOf": "2026-11-04T06:30:00.000Z", "last30Amount": "0.00", "last30Count": 0, "last30RefundAmount": "0.00", "successRate": 0, "trend": [/* 30 个 TrendPoint */] }
```

口径同 5.1，`successRate` 按集合 C 计算。

#### `POST /stores` → `201 Store`，`PUT /stores/{id}` → `Store`

> 门店主数据归 payment-core。以下写操作须调用**独立内部能力契约**（**【待核对】** 尚未设计），Portal 不得维护自有可写门店表，响应由 Portal 规范化。下列校验规则为 UI 侧期望，最终以核心为准。

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

应用不存在 `NOT_FOUND`；应用非 `ACTIVE` 返回 `APP_DISABLED`。新密钥初始状态、同一应用可并存的有效密钥数量上限及超限错误 **【待核对】**，以权威内部管理契约为准（当前 Mock 中的“5 把”仅为 UI 演示值，不构成协议）。

#### `POST /api-keys/{id}/rotate` → `201 CreatedApiKey`

- 原密钥为 `REVOKED/EXPIRED` 时返回 `INVALID_STATUS`
- 签发新密钥，原密钥进入过渡状态（`EXPIRING`），过渡期内新旧密钥均可验签；**过渡期时长、到期处理方式 【待核对】**（当前 Mock 中的“24h”仅为 UI 演示值）

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
- 历史投递的接收身份、地址与发送的事件字节固定，形成历史快照；不能用“当前有效 API Secret”或当前配置回推历史投递规则。这**不等于**每次尝试的时间戳与签名必须永久不变。

**【待核对】**（本仓库没有完整的权威通知契约，以下事项不得据本草案实现）：签名算法与签名头、签名材料及 `keyId` 标识、每次重试是否重签、ACK 判定、重试间隔与次数、`errorSummary` 截取规则。开发者中心“签名验证”页面的示例代码同样待核对后更新。

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
2. 统一处理错误：非 2xx 时解析响应体并抛出携带 `httpStatus`、`code`、`outcome`、`requestId` 的 `ApiError`，**保留 HTTP 与错误语义**；仅 **HTTP 401 且 `code === "UNAUTHENTICATED"`** 走 5.0 的刷新重试，其他错误不自动重试，不得把内部鉴权失败当作会话失效。**现状：`withAuth.ts` 目前只检查 `code`，`ApiError` 尚无 `httpStatus` 字段，需改造**（见第 8 节）
3. 资金写操作按 1.3 的规则：网络异常、非 JSON、解析失败、`outcome` 缺失/未知一律按 `UNKNOWN` 处理，且不得清除恢复记录
4. 在 `src/services/api/index.ts` 中将 `mockApi` 替换为 `httpApi`（可用 `import.meta.env.VITE_USE_MOCK` 切换）

接入真实后端前，须先完成第 8 节中的前端改造项。Mock 只用于验证 UI，**不构成资金验收**，也不代表真实后端已可对接。

---

## 7. 需求缺口（实现前需补齐）

| 缺口 | 说明 |
| --- | --- |
| 组织与成员 | 既定的组织/成员管理入口未覆盖；登录用户与商户的成员关系、当前租户、服务端资源授权需明确，不能只靠 `role` 字符串 |
| 多组织 | 若一个用户可属于多个商户，需设计租户切换流程与 token 中的租户标识 |
| 角色权限矩阵 | 各角色对页面、操作（退款、密钥、通知配置、门店编辑）的权限，以及门店 / App 数据范围 |
| 账单下载 | 正式账单下载未覆盖，交易 CSV 导出**不能替代**正式账单 |
| App 生命周期 | 当前仅查询，需确认是否为基础版有意裁剪 |
| 支付领域内部能力契约 | 协议、部署单元、端点、版本、服务鉴权与上下文（服务身份、租户、操作者、资源范围、审计）；覆盖交易查询、退款、门店/App 管理、密钥与通知管理 |
| 退款结果恢复协议 | 权威“确定未受理”判定、同号同参恢复条件、按业务号查询的一致性保证 |
| Portal ↔ 内部能力映射 | 字段映射、状态映射、错误码与 `outcome` 映射表 |
| 金额选型确认 | 方案 A（元字符串）为推荐方案，待用户单独确认；统计合计精度/范围 |
| 密钥生命周期 | 过渡期、并存上限、明文传递链路与审计要求 |
| 报表 | 数据来源（实时 / 只读投影）、延迟、权限过滤 |

## 8. 前端现状与本协议的差异（待改造）

当前前端与 Mock 按 v1 草案实现（代码保持旧版；`MerchantApi.auth` 注释已于 v1.2 更正），以下差异需按本文改造，**改造前前端不可直接对接真实后端**。涉及文件：`src/types/index.ts`、`src/services/api/types.ts`、`src/services/mock/*`、`CreateRefundDialog.vue`、`PaymentDetailPage.vue`、列表/统计/导出/通知/开发者文档页。

| 项 | 前端现状 | 目标 |
| --- | --- | --- |
| 退款可退金额 | Mock 以“订单金额 − 已退 − 处理中”计算，未计入 `SUSPENDED`，仅 `SUCCESS` 可退；无资格字段 | 使用权威可退金额 + `refundEligibility`（可为 null）；提交须满足 3.1 全部条件 |
| 退款幂等 | 重复编号返回 `DUPLICATE`；成功固定 `CREATED` | 同号同参返回已有资源；不同参数 `IDEMPOTENCY_CONFLICT`（不清除原号未知状态，R2） |
| 退款结果未知 | 弹窗每次打开重新生成编号；无待确认状态；仅组件内 `loading` 防重；Mock 按 `includes` 匹配编号且按商户全局唯一 | R3 先存后发的恢复上下文（`phase` 状态机、多标签页共享）；R4 以 `paymentId` 限定的精确查询；不得据 404 或后续 `REJECTED` 开放重提 |
| `MerchantApi` 方法 | 无精确查询方法 | 新增 `refunds.findByMerchantRefundNo(paymentId, merchantRefundNo)` |
| 错误语义 | `ApiError` 仅有 `code`；`withAuth` 仅按 `code` 判断刷新 | `ApiError` 增加 `httpStatus`、`outcome`、`requestId`；`withAuth` 改为 `httpStatus === 401 && code === "UNAUTHENTICATED"`；资金写的解析失败/缺失 outcome 默认 `UNKNOWN` |
| 统计口径 | 成功率用不同集合计算；无 `asOf`、`terminalCount`；比较值可能为 Infinity；桶仅有 `label`；渠道占比为裸数组 | 按 5.1 集合计算；所有报表顶层 `asOf`；`channel-share` 为 `{ asOf, items }`；比较值可为 null；桶使用 `key` |
| 测试覆盖 | 未覆盖未知资格、未知枚举、空金额、外部收款展示 | 补充对应 Mock 数据与展示 |
| 支付状态 | 无 `coreStatus`，不处理 `PART_REFUNDED/REFUNDED` | 按第 2 节映射 |
| 渠道 / 方式 | 仅 3 个渠道，方式为 `NATIVE/JSAPI/APP/MICROPAY` 等 | 使用核心取值，未知值展示原值 |
| 可空字段 | `merchantOrderNo`、`expireAt`、`storeName` 视为必有；无 `source` | 按第 3 节可空处理，支持 `EXTERNAL` |
| Webhook 事件 | 小写 6 事件；测试推送带 `test: true` | 核心 7 事件；独立测试语义，`isTest` |
| 签名验证文档页 | 展示 v1 草案签名算法与重试策略 | 待核心通知契约确认后更新 |
| 金额 | 整数分 `number`，`AmountDecimal` 命名与整数校验 | `AmountDecimal` 元字符串（待用户确认方案 A 后改造） |

仍待产品与领域设计、本文不作确认的事项：组织成员/权限矩阵、正式账单、App 生命周期、多组织范围、报表来源与延迟、内部能力契约。
