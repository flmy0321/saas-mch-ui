# 商户后台（Merchant Portal）网页接口协议 v1.4（候选草案）

> **文档状态：候选草案，可作为前端改造方向；尚不是后端联调验收依据，也不是内部服务契约冻结。** 已根据《UI 协议核查结果》（2026-11-03）、《v1.1 复核与修订意见》（2026-11-04）、《v1.2 复核结果及最后补充清单》（2026-11-04）与《v1.3 复核结果》（2026-11-04）修订。标记为 **【待核对】** 的条目依赖尚未设计的**支付领域内部能力契约**或核心锁定 Schema / 通知契约，在契约补齐前不得自行定义实现。**本版只修订文档；前端类型、Mock 与页面仍为旧版实现（`MerchantApi.auth` 注释除外），差异见第 8 节。**

> **036 修订（2026-11-11）**：评审通过支付列表精简视图提案（含两项调整），`GET /payments` 改为返回 3.1a `PaymentListPage`，仅影响支付列表；详情及其他接口不变。这是前端/协议侧草案，后台投影与端到端联调尚未完成。

> **037 提案（2026-11-14，待评审，未批准）**：036 列表草案的批准**仅适用于 `GET /payments`**，不延伸到详情。`GET /payments/{id}` 现行仍为 3.1 完整 `Payment`，但其中 `paidAmount`、`submittedAt`、`closedAt`、`failedAt`、`failReason`、`refundCount` 在核心 alpha.3 Payment 中无权威来源，`EXTERNAL` 的 `subject` 可为 null 也与 3.1 冲突。本版选择**方案 B：另立精简详情视图 `portal-payment-detail-view/0.1-draft`（3.1b）**，不采用“可缺省字段”，也不由前端补造字段来源。3.1b 评审通过前，前端类型、Mock、HTTP 解析与详情页**均不改动**；后台投影与端到端联调未开始。

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
| 鉴权 | Bearer Token：仅 `GET /auth/captcha`、`POST /auth/login`、`POST /auth/select-merchant`、`POST /auth/refresh` 无需 access token；其余所有接口（**含 `POST /auth/logout`**）须携带 `Authorization: Bearer <accessToken>`，详见 5.0。商户维度由 token 对应的用户确定，**任何请求参数都不得用于切换商户** |
| CSRF | 不使用 Cookie 鉴权，因此无需 CSRF Token；服务端不得从 Cookie 读取登录凭证。仅允许服务端下发的 HttpOnly、SameSite 匿名挑战 Cookie 绑定验证码与商户选择（见 5.0） |
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

**资金写操作的响应分类（按以下优先级依次判定，命中即止）：**

| 优先级 | 条件 | 前端分类 | 说明 |
| --- | --- | --- | --- |
| 1 | 无响应：网络异常、超时、连接中断、请求被中止 | `UNKNOWN` | — |
| 2 | HTTP `200/201/202`，响应体为合法 JSON，且是结构合法的 `Refund` 资源，其 `paymentId`、`merchantRefundNo`、`amount` 与本次请求一致 | `LOCATED` | **成功响应不含、也不要求 `outcome`**。按资源 `status` 展示；`status` 为本文未列出的新枚举值时照常展示为“未知状态”，**不因此判定资源损坏** |
| 3 | HTTP 2xx，但响应体非 JSON、解析失败、不是合法 `Refund`，或标识/参数与本次请求不匹配 | `UNKNOWN` | — |
| 4 | HTTP 401 且 `code === "UNAUTHENTICATED"` | 认证失败 | 按 5.0 在“本次尚未执行业务”的前提下**仅刷新重试一次**；**不消除该号此前的未知状态**（R2）。刷新后仍失败则保持原恢复上下文并转登录 |
| 5 | 其他非 2xx，响应体为合法 JSON，含已识别的 `code` 与已识别的 `outcome`（`REJECTED` / `NOT_ACCEPTED` / `UNKNOWN`） | 按 `outcome` | 受 R2 约束：`REJECTED` 只描述本次请求 |
| 6 | 其他非 2xx，响应体非 JSON、解析失败、`outcome` 缺失或为未列出的值 | `UNKNOWN` | — |

- `outcome` 只表示“本次请求结果是否确定”；`LOCATED` 只表示“已定位到退款资源”，**二者都不等于退款成功**。
- **任何 `UNKNOWN` 分类都不得清除恢复记录**（见 5.3 R3）。

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

> **例外：`GET /payments` 使用 `PaymentListPage`（见 3.1a），不使用 `Paginated<T>`。** 其 `total` 为精确十进制字符串 `ExactCount`，`page` 上限 1000000。其他列表暂保持 `Paginated<T>` 的 int `total`，未经单独评审不得顺带改动。

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

> **来源缺口（037）**：下表中 `paidAmount`、`submittedAt`、`closedAt`、`failedAt`、`failReason`、`refundCount` 在核心 alpha.3 Payment 中**无权威来源**；`subject` 定义为必为 string，与 `EXTERNAL` 可无商品描述的事实冲突。在核心提供来源并修订本表前，本表**不能作为后台交付依据**，不得以 `0`、`""`、统一 `null` 或占位描述填充上述字段冒充已交付。详情的候选替代见 3.1b。

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
- **前端开放“新建退款”提交须同时满足**（全部为真才可点击提交；仅适用于生成新编号的普通创建，**不适用于同号恢复**，恢复见 5.3 R1b）：
  1. 满足上述资金资格展示条件（以打开弹窗时实时取得的 5.2 `RefundableInfo` 为准）；
  2. 当前用户具有该订单的退款操作权限（权限来源见第 7 节，未定前按服务端 403 处理）；
  3. 当前用户/租户/订单**不存在待确认（UNKNOWN）或可能已发送的本地退款操作**（见 5.3 R3）——**无论可退余额是否仍足够**，待确认期间禁止从此入口另建退款；
  4. 不处于提交中；
  5. 输入金额符合 1.1 输入格式、大于 0、且不超出当前提示的可退金额（十进制比较）。
- 以上为防误操作的前端约束，**服务端必须独立授权并以核心原子校验为准**；前端校验通过不代表可退。
- `refundedAmount` / `refundingAmount` 只用于展示，**不得用于判断能否退款**。

### 3.1a PaymentListItem / PaymentListPage 支付列表精简视图（036，`portal-payment-list-view/0.1-draft`）

> **状态：前端已按此草案接入类型、Mock 与 HTTP 解析；后台列表投影、服务端 Schema 与端到端联调均未完成。** 本节只约束 `GET /payments`。详情 `GET /payments/{id}`、工作台 `recent-payments`、导出及其他接口**不随本节改动**，仍返回 3.1 `Payment`。

**设计原则**：列表使用独立 DTO，不复用 3.1 详情对象。核心列表投影当前无法权威提供的 `paidAmount`、`submittedAt`、`closedAt`、`failedAt`、`failReason`、`refundCount` **不出现在列表中**，不得以 `0`、`""` 或统一 `null` 占位冒充“已交付”。需要这些字段时进入详情页获取。

`PaymentListItem`：恰好以下 22 个键，全部必需（nullable 字段也必须出现，值为 `null`）；不得增减或省略键。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 平台支付订单号 |
| `source` | `API` \| `EXTERNAL` | 订单来源 |
| `merchantOrderNo` | string \| null | `API` 必为字符串；`EXTERNAL` 必为 `null` |
| `storeId` | string \| null | 核心 `storeCode`（`sto_` 业务编号），不是内部 ID |
| `storeName` | string \| null | 无合法关联来源时为 `null` |
| `subject` | string \| null | `API` 必为字符串；**`EXTERNAL` 可为 `null`**，表示核心无此事实。页面可渲染“—”等占位，占位只用于显示，**不回写 DTO、不进入导出/搜索/筛选** |
| `amount` | AmountDecimal | 订单金额，沿用 1.1 金额字符串语义 |
| `currency` | `CNY` | 本版固定 |
| `channel` / `method` | string | 核心取值，未知值展示原值 |
| `createdAt` | string | 创建时间 |
| `paidAt` | string \| null | 核心成功时间；未成功为 `null`（这是真实事实，不是占位） |
| `expireAt` | string \| null | 支付超时时间 |
| `refundedAmount` / `refundingAmount` | AmountDecimal | 仅展示，不得用于判断能否退款 |
| `refundPrincipalLimit` / `availableRefundAmount` | AmountDecimal \| null | 未知为 `null`，前端按不可退处理 |
| `refundEligibility` | string | 核心必需枚举（3.1 语义，开放字符串）；列表中不为 `null` |
| `collectionVerification` | string | 核心必需枚举（`PENDING`/`VERIFIED`/`REVIEW_REQUIRED`，开放字符串）；列表中不为 `null`，未入账订单为 `PENDING` |
| `status` | PaymentStatus | 网页视图状态，按第 2 节显式映射：`PART_REFUNDED`/`REFUNDED` → `SUCCESS` |
| `coreStatus` | string | 核心原始状态，原样保留 |
| `refundAggregate` | RefundAggregateStatus | 按第 2 节由核心状态映射：`PART_REFUNDED` → `PARTIAL`，`REFUNDED` → `FULL`，其余 → `NONE`；不由 Portal 依退款明细计算 |

`PaymentListPage`：

```json
{
  "viewVersion": "portal-payment-list-view/0.1-draft",
  "items": [],
  "total": "18446744073709551615",
  "page": 1,
  "pageSize": 20,
  "asOf": "2026-11-11T08:00:00.000Z"
}
```

| 字段 | 规则 |
| --- | --- |
| `viewVersion` | 固定字面量；前端不认识的版本按畸形响应处理，不猜测字段 |
| `total` | `ExactCount`：`^(0|[1-9][0-9]{0,19})$` 且 ≤ `18446744073709551615`（uint64）。**禁止 JSON number，禁止前导零、正负号、小数、科学计数** |
| `page` | int，1–1000000；越界回写实际页码（同 1.4） |
| `pageSize` | int，1–100 |
| `items` | 长度 ≤ `pageSize` |
| `asOf` | 查询快照时间 |

**页数计算**：前端以 `BigInt` 计算 `ceil(total / pageSize)`，全程不经 `Number`。可导航页数取 `min(精确页数, 1000000)`；超出时 `total` 照常完整显示，并提示用户缩小筛选范围。`total` 的千分位格式化直接作用于十进制字符串。

### 3.1b PaymentDetailView 支付详情精简视图（037 提案，`portal-payment-detail-view/0.1-draft`，**待评审，未批准**）

> **状态：仅为候选提案。** 不是已批准协议；3.1a 列表草案的批准不覆盖本节。评审通过前 `GET /payments/{id}` 仍按 3.1 定义，前端不切换。本节只涉及 `GET /payments/{id}`；`GET /dashboard/recent-payments`、导出、搜索等仍引用 3.1，存在同样的来源缺口，**不在本提案范围内**，需另行评审。

**方案选择**：

| 方案 | 结论 | 理由 |
| --- | --- | --- |
| A. 提供权威来源并修订 3.1 | 本轮不选 | 字段来源须由核心/内部能力契约提供，前端无法给出；待核心新增来源后可按 A 升级（见下“演进”） |
| B. 另立精简详情视图 | **选用** | 只声明已有权威来源的事实；不存在的字段不出现 |
| C. 将六字段改为可缺省 | 不选 | “键缺失”无法区分“核心无此能力”“暂未取得”与“畸形响应”，前端解析会变得含糊，容易被当作已交付 |

**`PaymentDetailItem` 字段**：与 3.1a `PaymentListItem` **同一组 22 个键、同一类型与约束**（含 `source` 与 `merchantOrderNo`/`subject` 的联动规则、`status`/`refundAggregate` 显式映射、金额字符串语义、`refundEligibility`/`collectionVerification` 在本视图中不为 `null`）。全部必需，不得增减或省略键。详情目前没有超出列表的权威字段，因此不新增键；以后新增须升版本。

**明确不包含**：`paidAmount`、`submittedAt`、`closedAt`、`failedAt`、`failReason`、`refundCount`。这些键**不出现**，不是值为 `null`。`null` 在本协议中表示“核心提供了该字段，当前值为空”，不能借用来表示“没有该能力”。

**响应包装**：

```json
{
  "viewVersion": "portal-payment-detail-view/0.1-draft",
  "payment": { "...": "PaymentDetailItem，22 键" },
  "asOf": "2026-11-14T08:00:00.000Z"
}
```

| 字段 | 规则 |
| --- | --- |
| `viewVersion` | 固定字面量；前端不认识的版本按畸形响应处理，不猜测字段，不回退 3.1 解析 |
| `payment` | 键集合必须恰好等于 22 键；多键、少键或出现上述六字段之一均按畸形响应处理 |
| `asOf` | 查询快照时间 |

**对页面的影响（评审通过后才实施）**：

| 现有展示 | 改为 |
| --- | --- |
| 金额卡“实收”（`paidAmount`） | 移除“实收”；只显示订单金额 `amount`。不以 `amount` 冒充实收 |
| 时间线“用户提交支付”（`submittedAt`） | 移除该节点 |
| 时间线“支付成功” | 保留，时间取 `paidAt`；备注不再写“实收 X” |
| 时间线“支付失败 / 订单关闭”（`failedAt` / `closedAt`） | 保留状态节点，但**不显示时间**；不以 `createdAt`/`expireAt` 推算 |
| 失败原因提示（`failReason`） | 移除；只显示“支付失败”状态，不生成通用失败原因冒充渠道原因 |
| 关闭说明“超时未支付或商户主动关闭” | 移除。这是推断，不是事实 |
| 退款笔数（`refundCount`） | 不从 Payment 读取；继续用现有 `GET /refunds?paymentId=` 返回的 `Paginated.total`，按退款列表口径标注 |
| 商品描述（`subject`） | `EXTERNAL` 为 `null` 时显示“—”；占位只用于渲染，不回写数据 |

**对类型与实现的影响（评审通过后才实施）**：新增 `PaymentDetailItem` / `PaymentDetailView` 类型；`MerchantApi.payments.get` 返回 `PaymentDetailView`；Mock 按 22 键显式投影；HTTP 端严格校验键集合与 `viewVersion`；3.1 `Payment` 仍由 `recent-payments` 等未评审接口使用，暂不删除。

**演进**：核心以后为某字段提供权威来源时，以 `portal-payment-detail-view/0.2-draft` 单独评审加入，并写明来源与 `null` 的含义。不得在 0.1 中悄悄增加键。

**不受本提案影响**：5.2 `RefundableInfo` 沿用现行定义，本轮无协议改动。`ineligibleReason` 只是根据现有资格枚举生成的通用展示文字，不代表核心提供了具体渠道原因。金额或资格未知时仍为 `null`，前端仍保守禁用。最终资金校验仍由核心在提交时原子完成，页面与只读接口都不能替代。

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
- `MerchantSelection`：`selectionToken`, `expiresAt`（UTC epoch **毫秒**）, `tenantIds: string[]`（仅 ID，无名称/Logo）
- `SelectMerchantInput`：`selectionToken`, `tenantId`
- `AuthTokens`：`tokenType: "Bearer"`, `accessToken`, `expiresIn`（秒）, `refreshToken`, `refreshExpiresIn`（秒）；`LoginResult` = `AuthTokens` + `user: CurrentUser`（仅为第二步 `select-merchant` 的结果）
- `Notification`：`id`, `title`, `description`, `createdAt`, `read`, `level: info | warning | danger`, `link?`（前端路由路径，如 `/payments/pay_xxx`）

---

## 4. 接口清单

| 前端方法 | HTTP |
| --- | --- |
| `auth.captcha()` | `GET /auth/captcha`（无需鉴权） |
| `auth.login(input)` | `POST /auth/login`（无需鉴权，返回 `MerchantSelection`） |
| `auth.selectMerchant(input)` | `POST /auth/select-merchant`（无需鉴权，返回 `LoginResult`） |
| `auth.refresh(refreshToken)` | `POST /auth/refresh`（无需鉴权） |
| `auth.logout(accessToken)` | `POST /auth/logout`（Bearer 当前 access） |
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

### 5.0 认证 Auth（两阶段登录，身份契约 v0.2）

> **状态**：两阶段登录路径与字段已获用户确认，权威资料为 `merchant-platform/docs/contracts/identity-http-v0.2.openapi.json` 与 `src/identity/portal-contract.mjs`（SHA-256 `3d78d91f…6846ee`）。后端验证分项记录：**028** 真实 MySQL 领域/维护测试已通过；**029** 真实 PNG 验证码及 loopback HTTP 测试已通过；匿名 Cookie 签名/过期/重复、配置拒绝与 HTTP 登录流程的定向测试已通过（SQL 替身）。**尚未完成**：真实数据库 + 后台 HTTP + 浏览器的联合验收，以及生产部署（可信代理 / clientKey 规则、`allowedOrigins`）。前端已实现 HTTP 模式（仅与本地联调桩验证过同源 Cookie 流程，后台复核为代码级兼容），默认仍为 Mock，**不代表真实商户登录已上线**；前端实现全部接口不表示后台所有业务接口已实现。本节不改变任何资金规则。

Base URL `/api/portal/v1`，**必须同源**：开发经 Vite 代理 `/api`，生产经同源反向代理；前端不支持跨域 Base URL。**登录凭证只经 `Authorization: Bearer`，服务端不从 Cookie / query 读取登录凭证**；允许使用匿名挑战绑定 Cookie（见下）。所有身份响应 `Cache-Control: no-store`。错误体 `{code,message,requestId}`。

#### 匿名挑战绑定 Cookie

- 由服务端在 `GET /auth/captcha` 时生成并下发，`HttpOnly`、`SameSite`；名称、值、期限、签名密钥与 `Path` 均由后台负责。
- 用途仅为把验证码、`login` 与 `select-merchant` 绑定到同一浏览器；**不是登录凭证**，不能替代 Bearer，正式业务接口不依赖它。
- 前端不读取、生成或手工拼接该 Cookie；所有请求使用 `fetch(..., { credentials: 'same-origin' })` 由浏览器自动携带。三步请求须由同一浏览器发出；Cookie 缺失或不匹配时按服务端错误码处理（如 `400 CAPTCHA_INVALID`、`401 INVALID_CREDENTIALS`），前端不重放、不回退 Mock。
- 后台实际属性（供参考，前端不依赖、不写死）：`HttpOnly; SameSite=Strict; Path=/`，不设置 `Domain`；生产 `Secure`，名称 `__Host-portal-anonymous`（`__Host-` 前缀要求 `Path=/`）；本地 HTTP 且明确 `secure=false` 时名称 `portal-anonymous`。有效期默认 1800 秒，自签发计时、不随请求滚动，部署可配置 60–86400 秒。
- 因 `Path=/`，业务请求也可能携带该 Cookie，属正常；服务端从不把它当作登录凭证，前端也不得依赖“业务请求不带 Cookie”。
- Cookie 缺失、篡改、重复或过期时，后台重新签发新的随机绑定，不沿用未验证值。此时带旧挑战提交 `login` 返回 `400 CAPTCHA_INVALID`；带旧 `selectionToken` 提交选择返回 `401 INVALID_CREDENTIALS`。前端**不自动重发、不调用 refresh**，回到凭据步骤并重新获取验证码。
- Cookie 不是 refresh 的授权条件（refresh 仅凭 `refreshToken`）；匿名 Cookie 过期不会注销已建立的 Bearer 会话。
- 开发代理（`vite.config.ts`）：`/api` → `PORTAL_DEV_PROXY_TARGET`，`changeOrigin: false` 保留浏览器 `Host` 与 `Origin`；`cookieDomainRewrite: ''` 仅在上游意外带 `Domain` 时去掉该属性，对当前后台通常无实际作用。`changeOrigin: false` 不能替代后台来源配置：后台 `allowedOrigins` 必须明确包含浏览器页面源（含端口）。
- 生产反向代理：原样转发 `Set-Cookie` / `Cookie` 并保留 `Origin`，保持浏览器同源；不添加 `Domain`，不改写名称、`Path`、`Secure` 或 `SameSite`；**不得缓存带 `Set-Cookie` 的身份响应**给其他浏览器。

#### `GET /auth/captcha`

响应 `Captcha { captchaId, image, expiresIn }`。`image` 为后台返回的 PNG data URL（`data:image/png;base64,…`），HTTP 模式前端校验前缀后直接作 `<img src>`，不接受远程 URL 或其他类型（格式不符视为响应异常）；响应同时下发匿名挑战 Cookie；`expiresIn` 为秒，前端按返回值判断到期（不写死）。4 位 ASCII、大小写不敏感、一次性（校验后即作废，含密码错误）。提交失败仍停留凭据步骤时重新获取。

#### `POST /auth/login`（第一步：验证凭据）

请求 `LoginInput`；`account` 可去首尾空白，规范化由服务端决定；`password` 原样传递。成功响应 `MerchantSelection`：

```json
{ "selectionToken": "sel_…", "expiresAt": 1793000000000, "tenantIds": ["M2024010800012"] }
```

**不返回 user 或 access/refresh**。前端不保存正式 token、不 bootstrap、不跳转。错误：`400 CAPTCHA_INVALID / VALIDATION`、`401 INVALID_CREDENTIALS`（账号不存在与密码错误同码同文案）、`423 ACCOUNT_LOCKED`、`429 RATE_LIMITED`、`503`。

#### `POST /auth/select-merchant`（第二步：显式选择商户）

请求 `SelectMerchantInput { selectionToken, tenantId }`，响应 `LoginResult`。

- `tenantId` 只能取自第一步 `tenantIds`；即使只有一个也须用户明确确认，前端不暗选。列表只有 ID，展示为“商户号/标识”，不伪造名称或查询端点。
- 服务端重新校验成员资格、凭证期限与一次性消费；前端传入的 `tenantId` 只是请求，不是授权事实。正式 token 绑定该商户，任何业务参数都不能切换。
- 选择凭证过期/复用 → `401 INVALID_CREDENTIALS`；成员资格失败 → `403`。两者都回到凭据步骤，**不调用 refresh**。
- 网络错误/503：会话可能已建立但响应未到，前端**不自动重复 complete**，提示状态无法确认并让用户重新验证凭据。
- 选择凭证仅存在于页面内存，不进 URL、Storage、日志或跨页广播；无“取消即服务端撤销”接口。

#### `POST /auth/refresh`

请求 `{ refreshToken }`，响应 `AuthTokens`。**每个 refresh token 只成功一次**；并发时一个成功，其余 `409 REFRESH_ALREADY_USED`，**旧 refresh 被拒但不撤销赢家会话**（原“重放即撤销整个会话”规则已删除）。无效/过期/会话已撤销 → `401 UNAUTHENTICATED`。

前端行为：

1. 仅当受保护接口返回 HTTP `401` 且 `code === UNAUTHENTICATED` 时刷新并最多重试原请求一次；重试读取最新 Authorization。`INVALID_CREDENTIALS`、403/404/409/423/429/5xx、网络错误、`UPSTREAM_UNKNOWN` 不进入该分支。`auth.*` 接口本身不套自动刷新。
2. 同页 single-flight + 跨标签页 Web Locks 互斥；取得锁后重读共享存储，若其他页已轮换则直接复用，不发送旧 refresh。不支持 Web Locks 时失败关闭并提示，不竞争刷新。
3. 共享存储维护客户端 `generation/revision`（仅客户端竞争控制，非服务端 sessionId）。新登录/退出改变 generation；刷新结果写入前核对，过期结果不得复活已退出登录或覆盖新登录。
4. `409`：重读共享版本，有赢家则使用；否则进入“登录状态无法确认”并要求重新登录，不盲发旧 refresh，不声称服务端已撤销，不清除其他 generation。
5. 仅 refresh 返回 `401 UNAUTHENTICATED` 才按当前 generation 清理并跳转登录；网络/超时/503 不自动重试（可能已消费），提示重新登录恢复。
6. 跨页通知只传版本/事件，不广播密码、验证码、选择凭证或 token。

#### `POST /auth/logout`

携带当前 access 的 Bearer 头，幂等 `204`。前端不为退出先刷新；无论成败都清理该 generation 的本地登录、user/merchant/stores/notifications 与页面缓存。退出与新登录参与同一 generation 控制，旧 bootstrap/业务读取返回后若 generation 不匹配则丢弃。`CurrentUser.role` 仅展示，不作权限依据。

#### 账户安全语义

- `POST /account/password {current,next}` → `204`；原密码错 `400 INVALID_PASSWORD`，策略拒绝 `400 VALIDATION`，失败不表示其他会话已撤销。成功保留当前会话、其他会话立即失效。
- `GET /account/sessions`：仅本人未撤销/未过期会话，按活动时间倒序；空设备/位置表示未提供，`current` 由服务端给出。
- `DELETE /account/sessions/{id}` → `204`；当前/不存在/他人会话一律 `404 NOT_FOUND`。前端隐藏当前行下线按钮，404 只刷新列表并提示，不触发刷新登录。
- `401 UNAUTHENTICATED` 会话失效；`403` 权限拒绝；`503 IDENTITY_DEPENDENCY_UNAVAILABLE` 提示暂不可用。

#### 前端模式

`VITE_API_MODE=mock | http` 必须显式设置，无失败自动回退。演示账号与一键填入仅在 Mock 模式开发构建出现；Mock 内存 Map 仅供演示，不代表真实持久化或安全验证码。

HTTP 模式实现位于 `src/services/http/`（`client.ts` 统一 fetch，`api.ts` 实现 `MerchantApi`），外层仍套 `withAuth`（refresh 规则不变）。要点：

- 固定相对路径 `/api/portal/v1`；`credentials: 'same-origin'`、`cache: 'no-store'`、`redirect: 'error'`、15 秒超时。
- `captcha / login / select-merchant / refresh` 不带 Authorization；`logout` 带调用方给定的 access；其余业务接口每次发送时读取共享存储中的最新 access。
- 无响应（网络/超时）抛 `httpStatus = 0`，不自动重试；非 2xx 按 `{code,message,requestId}` 转为 `ApiError`；资金写 2xx 原样交由调用方分类。
- `login` 响应校验 `selectionToken / expiresAt / tenantIds`，格式不符视为响应异常，不进入商户选择。
- 开发联调：`VITE_API_MODE=http` 时 `PORTAL_DEV_PROXY_TARGET`（非 `VITE_` 前缀，不进入产物）必填，否则 Vite 启动即报错。

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

#### `GET /payments` → `PaymentListPage`（3.1a 精简视图，非 `Paginated<Payment>`）

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

#### `GET /payments/{id}` → `Payment`（现行 3.1；候选 3.1b `PaymentDetailView` 待评审）

036 列表草案的批准不适用于本接口。现行 3.1 中六个字段在 alpha.3 无权威来源（见 3.1 来源缺口），因此本接口**目前没有可交付的权威定义**。3.1b 评审通过后，本接口改为返回 `PaymentDetailView`，前端同步切换；在此之前前端维持现状，HTTP 联调不以本接口作为验收项。

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

**R1 两类动作分开定义：**

- **R1a 新建退款（生成新编号）**：按 3.1“前端开放‘新建退款’提交须同时满足”。资金资格只是必要条件之一；任何待确认操作存在时，此入口禁止另建退款。服务端独立授权并以核心原子校验为准。
- **R1b 同号确认/恢复（沿用原编号与原参数）**：**不复用 R1a 的按钮与开放条件**，使用独立的“同号确认/恢复”动作。
  1. 仅当**权威恢复协议明确允许**（如权威返回 `NOT_ACCEPTED` 且恢复协议规定可同号重提）时才开放；
  2. 只能以恢复上下文中**保存的原参数**发送，不得修改金额/原因，不得换号；
  3. 发送前重新认证并由服务端重新授权；是否可受理（含新增资格、余额判断，以及是否应先返回已有资源）**由内部恢复契约判断**，前端不以 R1a 的资格/余额条件替代；
  4. **内部恢复协议尚未设计**。在其就绪前，此动作**不开放**：`NOT_ACCEPTED` 上下文仅展示“待确认/请联系客服”与精确查询入口，前端不自行发送；
  5. `NOT_ACCEPTED` **不得解释为换号许可**，不得据此开放 R1a 新建。

**R2 结果确定性的作用范围（`REJECTED` 不清除原号的未知状态）：**

1. `outcome` 只描述**本次请求**。某业务号一旦出现过 `UNKNOWN`（或可能已发送但无响应），该业务号即处于“待确认”，**后续任何请求的确定性拒绝都不得覆盖它**，除非权威恢复协议明确证实原操作**未受理**（`NOT_ACCEPTED`）或精确查询定位到原退款资源。
2. 典型情形：同号不同参 `IDEMPOTENCY_CONFLICT` 只证明冲突请求未产生新退款，原编号可能已对应一笔已受理、处理中甚至成功的退款；认证失败（401）、权限变化（403）、参数校验失败（400）、资格/额度拒绝（409）同理。前端收到这些响应时**保留原恢复上下文**，转为按原号精确查询并核对原资源，**不得据此标记“确定未执行”、不得生成新编号**。
3. 精确查询找到退款资源时，结果视为“已定位”：将恢复上下文更新为该资源并按其 `status` 展示，但**不表示资金成功**。如需再发起一笔新的正常退款，按 R3 第 8 条执行；**UI 不以本地记录释放或扣减额度**。
4. 只有“从未发送”的草稿被确定性拒绝（首次请求即收到 `REJECTED` 且该号此前无任何未知记录）时，才可视为该号未执行，并允许用户修改参数后**以新编号**重新提交。

**R3 恢复上下文：先保存，再发送（前端）：**

1. 生成 `merchantRefundNo` 后、**发出首次 `POST /refunds` 之前**，先持久化恢复上下文：`userId`、租户（商户号）、`paymentId`、作用域信息（见 R4）、`merchantRefundNo`、完整请求参数（`amount` 规范化值、`reason` 规范化值）、`createdAt`、`phase`。
2. `phase` 取值：
   - `DRAFT`：已生成编号、尚未发送。可修改参数（编号不变）或丢弃；
   - `SENT_PENDING`：已开始发送、尚未得到确定结果（含无响应、刷新中断、解析失败、`UNKNOWN`）。**不得修改参数、不得换号、不得自动重发**；
   - `LOCATED`：已定位到退款资源（记录 `refundId` 与最近 `status`）；
   - `REJECTED_DRAFT`：仅适用于 R2 第 4 条情形；
   - `NOT_ACCEPTED`：权威确认本次未受理。仅可经 R1b“同号确认/恢复”动作以原参数重提；恢复协议未就绪时只展示待确认/联系客服，不发送，不换号。
3. 写入 `SENT_PENDING` **必须在请求发出之前完成**；**写入失败（如存储不可用、配额满）时不得发送请求**，提示用户后中止。任何异常路径（含 JSON 解析失败）都不得删除该记录。
4. 恢复 `SENT_PENDING` 时**先查询、不自动重发**：调用精确查询；未定位到资源时继续展示“待确认”，由用户手动刷新确认。
5. 连点、重复打开弹窗、刷新页面不得生成新编号：同一 `userId + 租户 + paymentId` 存在未结束（`DRAFT`/`SENT_PENDING`/`NOT_ACCEPTED`）的上下文时，复用它。
6. 多标签页：恢复上下文须存放于同源共享存储（如 `localStorage`，按 `userId + 租户` 命名空间隔离），并通过 `storage` 事件或 `BroadcastChannel` 同步；另一标签页存在 `SENT_PENDING` 时，本页同样进入“待确认”并禁止新建。**不得只依赖组件内 `loading` 状态防重**。`storage` 事件与 `BroadcastChannel` 只用于同步信息，**不提供原子互斥**；实现须避免多个标签页同时读到空记录而各自生成不同编号（例如：写入后立即回读确认本页写入的编号仍为当前记录，不一致则放弃本页编号、改用已存在的记录）。此为前端实现验证重点，不构成后端契约。
7. 浏览器记录是防误操作辅助，**不是服务端资金锁**；服务端幂等与额度约束必须独立成立。退出登录时可保留该记录（按用户隔离），重新登录同一用户后恢复。
8. **结束上下文与开放另一笔退款**（与既有多笔/部分退款方向一致，本文**不新增**“每订单仅一笔未完成退款”的串行限制）：
   - `LOCATED`：该上下文归档为“已定位记录”，继续展示该退款的进度（按资源 `status` 刷新），**不要求资源到达终态**；
   - `REJECTED_DRAFT`：可丢弃；
   - 归档或丢弃后，是否开放另一笔新退款（新编号）**仅由 R1a 决定**：实时取得的权威资格与剩余可退额度、当前权限、以及明确的产品策略；
   - 不得依据 `FAILED`/`CLOSED` 等状态字符串或 HTTP 状态推断额度已释放；`SUSPENDED` 不是终态；
   - 权威资格不可得、或存在任何 `SENT_PENDING`/`NOT_ACCEPTED`/未定位记录时，保守禁用新建；
   - 若产品日后决定改为串行，须由产品明确串行策略与权威结束条件，并在所有退款入口一致执行，本文不自行规定。

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
2. 统一处理错误：非 2xx 时解析响应体并抛出携带 `httpStatus`、`code`、`outcome`、`requestId` 的 `ApiError`，**保留 HTTP 与错误语义**；仅 **HTTP 401 且 `code === "UNAUTHENTICATED"`** 走 5.0 的刷新重试，其他错误不自动重试，不得把内部鉴权失败当作会话失效。**现状：已实现**——`ApiError` 已携带 `httpStatus`（无响应为 `0`）、`code`、`outcome`、`requestId`；`withAuth.ts` 已按 `httpStatus === 401 && code === "UNAUTHENTICATED"` 判定刷新
3. 资金写操作按 1.3 的响应分类优先级：合法且匹配的 2xx `Refund` 为 `LOCATED`（不要求 `outcome`）；无响应、2xx 资源损坏或不匹配、非 JSON、解析失败、错误响应缺失或未知 `outcome` 为 `UNKNOWN`，且不得清除恢复记录
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
| 错误语义 | **已完成**：`ApiError` 已有 `httpStatus`、`outcome`、`requestId`；`withAuth` 已按 HTTP 401 + `UNAUTHENTICATED` 判定 | （已达成）`ApiError` 增加 `httpStatus`、`outcome`、`requestId`；`withAuth` 改为 `httpStatus === 401 && code === "UNAUTHENTICATED"`；资金写按 1.3 分类优先级判定（合法匹配的 2xx 为 `LOCATED`，错误响应缺失/未知 outcome 为 `UNKNOWN`） |
| 统计口径 | 成功率用不同集合计算；无 `asOf`、`terminalCount`；比较值可能为 Infinity；桶仅有 `label`；渠道占比为裸数组 | 按 5.1 集合计算；所有报表顶层 `asOf`；`channel-share` 为 `{ asOf, items }`；比较值可为 null；桶使用 `key` |
| 支付列表视图（036） | **前端已完成**：`payments.list` 返回 `PaymentListPage`；列表项为独立 `PaymentListItem`；`total` 为字符串，分页以 BigInt 计算；HTTP 模式校验 `viewVersion`、`total` 格式与 22 个键，不符即报畸形响应，不回退 Mock | 后台列表投影与服务端 Schema 待实现；尚无真实后台 + 浏览器联合验收 |
| 测试覆盖 | 未覆盖未知资格、未知枚举、空金额、外部收款展示 | 补充对应 Mock 数据与展示 |
| 支付状态 | 无 `coreStatus`，不处理 `PART_REFUNDED/REFUNDED` | 按第 2 节映射 |
| 渠道 / 方式 | 仅 3 个渠道，方式为 `NATIVE/JSAPI/APP/MICROPAY` 等 | 使用核心取值，未知值展示原值 |
| 可空字段 | `merchantOrderNo`、`expireAt`、`storeName` 视为必有；无 `source` | 按第 3 节可空处理，支持 `EXTERNAL` |
| Webhook 事件 | 小写 6 事件；测试推送带 `test: true` | 核心 7 事件；独立测试语义，`isTest` |
| 签名验证文档页 | 展示 v1 草案签名算法与重试策略 | 待核心通知契约确认后更新 |
| 金额 | 整数分 `number`，`AmountDecimal` 命名与整数校验 | `AmountDecimal` 元字符串（待用户确认方案 A 后改造） |

仍待产品与领域设计、本文不作确认的事项：组织成员/权限矩阵、正式账单、App 生命周期、多组织范围、报表来源与延迟、内部能力契约。
