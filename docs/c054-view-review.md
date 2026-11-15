# C054-VIEW 消费需求评审与最小 DTO 提案（V0 前端）

> 状态：**评审提案**，不是已冻结协议。本文所有 `viewVersion`、字段名、错误码和参数都是**新增提案**，C054-* 只是需求编号，不代表 operationId、URL 或版本承诺。
> 本轮没有改页面、类型、Mock 或 HTTP 代码，也没有连接真实后台。后台尚未交付这些能力，Mock 与类型检查结果不能当作真实 HTTP 或端到端通过。
> 已批准的 036（支付列表）、037（支付详情）、038（资源只读视图）只覆盖各自范围，本文**不**把它们的批准扩展到 recent / options / search / 写响应 / 聚合。

符号：**接受** = 按背景说明直接采纳；**建议修改** = V0 提出与现文档不同的做法；**待确认** = 需后台 / Core / 产品决定，V0 只列消费需求。

---

## 1. 结论总表

### 1.1 工作台 recent 支付

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 字段集 | 接受 | 直接复用 036 的 22 字段 `PaymentListItem`，同一校验器，不另造更小字段集；六个未交付字段不复活 |
| 响应包装 | 建议修改 | 现文档返回裸 `Payment[]`，改为独立对象包装，不套用分页包装（无 `total/page/pageSize`） |
| `asOf` | 建议修改 | 现文档写"不带 asOf"。建议带：工作台与报表卡片同屏，用户需要知道这批记录的观察时间 |
| 排序与条数 | 接受（提案值） | `createdAt` 降序，相同时 `id` 降序；`limit` 默认 10，上限 20 |
| 空 vs 未交付 | 建议修改 | 200 + `items: []` 只表示"完整授权集合为空"；未交付必须是明确错误，不能返回空数组 |
| 无权限 | 接受 | 403 时卡片显示无权限，不显示空列表、不显示"查看全部"入口 |

### 1.2 门店 / App options

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 最小字段 | 建议修改 | 门店 `id/storeNo/name/status`；App `id/appId/name/env/status`。不带地址、联系人、统计 |
| 完整集合 | 建议修改 | options 必须是完整授权集合，或明确报超限；不允许"返回前 N 条"。现文档"门店 < 1000 不分页"改为硬上限 + 超限错误 |
| 超限交互 | 建议修改 | 超限时下拉切换为"输入关键字远程搜索"（复用已批准的 038 分页目录），并明确提示不是完整列表 |
| 停用资源 | 建议修改 | 停用 / 关闭 / 吊销资源也返回，用于筛选历史数据；页面置于"已停用"分组并标注状态 |
| 无权限 / 空 / 依赖失败 | 建议修改 | 403 / 200 空集 / 5xx 三种状态分别展示，不合并为"暂无门店" |
| 切换后清理 | 接受（提案规则） | 见 3.2.4 |
| 不按名称猜标识 | 接受 | 筛选只用 `id`；URL 中的 `id` 不在 options 时显示"未知门店（id）"，不按名称匹配 |

### 1.3 全局 search

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 资源类型 | 待确认 | V0 需求：支付、退款、门店三类；App 不进首批 |
| 匹配方式 | 建议修改 | 单号类只做精确匹配；门店名称做包含匹配。现文档"模糊匹配订单号"改为精确 |
| 包装 | 建议修改 | 现文档返回裸数组且带服务端拼好的 `subtitle/to`。改为按类型分组对象，服务端只给事实字段，展示文案和路由由前端派生 |
| 总数 | 建议修改 | 不显示总数，只返回每组 `truncated` |
| 部分类型无权限 | 建议修改 | 不整体拒绝；该组返回 `FORBIDDEN` 状态且不含任何条目，页面显示"无权限，未搜索此类" |
| 存在性 | 接受 | 不可见与不存在一律"无结果"，不返回任何可区分信号 |

### 1.4 写响应

| 页面 | 结论 | 说明 |
| --- | --- | --- |
| 退款 | 接受 + 待确认 | 四类结果（确定拒绝 / 未受理 / 已受理 / 未知）的前端分类已按此实现；"未受理"需要 Core 给出可信的未受理保证，否则一律按未知 |
| 门店 | 建议修改 | 创建 / 更新返回 038 门店视图 + `version`；更新需带 `version` 做乐观锁。编辑入口仍按 V051-5 关闭，等写契约评审 |
| Key | 建议修改 + 待确认 | 秘密只在首次创建响应中出现；响应丢失后的恢复按"吊销后重建"设计，是否支持幂等重放由 Core 定 |
| Webhook | 建议修改 + 待确认 | 配置、测试、投递、attempt 四类事实分开；attempt 来源未交付前，页面不显示明细 |
| 近期认证 | 待确认（产品需求） | 见 3.4.5，不使用 `lastActiveAt` |

### 1.5 聚合页面

| 项 | 结论 | 说明 |
| --- | --- | --- |
| 集合 P / R / C 与指标定义 | 接受 | 按背景说明；R 用真实退款成功时间，不用 `updatedAt` / 失败关闭时间 / 支付累计退款额 |
| 时区 | 建议修改 | 首批固定 `+08:00`，响应回显 `timezone`，页面显式标注"北京时间（UTC+8）"；文档中"商户时区"改为此值 |
| 7 / 30 日 | 接受（提案规则） | 自然日、含今天、今天截至 `asOf` |
| 同比 | 建议修改 | 首批只做环比（上一等长周期）；同比不进首批，规则先记录在 3.5.1 供产品确认 |
| 比较值 | 建议修改 | 服务端返回**上期原始精确值**，不返回已算好的浮点比率；前端用十进制计算展示值 |
| successRate 比较 | 建议修改 | 显示百分点差，不显示比例变化 |
| 数值类型 | 建议修改 | 计数改为十进制整数字符串（u64）；金额保持十进制字符串；比率返回分子 / 分母 |
| 零分母 | 接受 + 建议修改 | `successRate` 分母 0 时页面显示"—"而不是 0%（服务端仍按 V0 约定可给 0，见 3.5.3） |
| 空集合与未知 | 接受 | 完整空集合显示 0；未知、无权限、未交付、依赖失败各自显示状态，不伪装为 0 |
| asOf | 接受 | 每个报表各自带 `asOf`；不声称多个组件同快照 |
| processing | 待确认 | V0 期望见 3.5.6 |
| 金额口径 / 跨 App 退款 / 权限交集 / 上限 / URL / 签名 / 版本 | 待确认 | 第 6 章只列消费影响 |

---

## 2. 通用约定（新增提案）

- 所有新视图均为对象包装，带 `viewVersion`；字段集合严格相等，多字段、少字段、未知版本都视为格式错误（与 036/037/038 一致）。
- 未交付能力：服务端返回明确错误（提案 `501 CAPABILITY_NOT_AVAILABLE`），前端显示"该功能暂未开放"。**不得**以 200 空数组、0 或 404 表示未交付。
- 依赖失败：`503 DEPENDENCY_UNAVAILABLE`（提案），前端显示"数据暂时无法获取"并提供重试。
- 前端在 HTTP 模式下失败时**不回退 Mock**。
- 精确数值：
  - `AmountDecimal`：十进制字符串，两位小数，正则 `^-?(0|[1-9]\d*)\.\d{2}$`，不设单笔上限校验（聚合可超出单笔上限）。
  - `CountString`（新增提案）：u64 十进制整数字符串，`^(0|[1-9]\d*)$`，值 ≤ 18446744073709551615。
  - 前端内部以字符串 / BigInt / 十进制库计算，只在图表渲染边界转为 Number（见 3.5.3）。

---

## 3. 最小 DTO 与响应包装提案

### 3.1 recent 支付

`GET <recent>?limit=10`（URL 待后台定）

```json
{
  "viewVersion": "portal-dashboard-recent-payments-view/0.1-draft",
  "items": [ /* PaymentListItem（036，22 字段，严格） */ ],
  "limit": 10,
  "asOf": "2026-11-15T06:30:00.000Z"
}
```

- `items.length ≤ limit ≤ 20`；排序 `createdAt` 降序，相同时 `id` 降序。前端校验顺序，乱序视为格式错误。
- `limit` 回显请求值；非整数或越界返回 `VALIDATION`（不截断，条数小，截断无意义）。
- 页面状态：
  - 200 且有数据：列表，卡片角标"更新于 HH:mm:ss"。
  - 200 且 `items: []`：显示"暂无支付"。
  - 403：显示"无支付查看权限"，隐藏"查看全部"。
  - 501：显示"暂未开放"。
  - 5xx / 网络错误：显示"加载失败"+ 重试，不显示空态。
- EXTERNAL `storeName: null` 显示"—"；`merchantOrderNo: null` 显示平台单号。

### 3.2 options

#### 3.2.1 门店

```json
{
  "viewVersion": "portal-store-options-view/0.1-draft",
  "items": [
    { "id": "st_1", "storeNo": "S0001", "name": "旗舰店", "status": "ACTIVE" }
  ],
  "asOf": "2026-11-15T06:30:00.000Z"
}
```

#### 3.2.2 App

```json
{
  "viewVersion": "portal-app-options-view/0.1-draft",
  "items": [
    { "id": "app_1", "appId": "a_live_x", "name": "小程序", "env": "LIVE", "status": "ACTIVE" }
  ],
  "asOf": "2026-11-15T06:30:00.000Z"
}
```

- 完整授权集合；排序 `name` 升序，相同时 `id` 升序（仅为稳定展示）。
- 硬上限提案：门店 1000、App 200（待后台按预算确认）。超出时返回 `422 OPTIONS_LIMIT_EXCEEDED`（提案），**不返回截断列表**。
- `id` 在集合内唯一；重复视为格式错误。
- `status` 按 038 原值透传，未约定值显示"未知（原值）"。

#### 3.2.3 页面行为

| 情况 | 下拉表现 |
| --- | --- |
| 200 有数据 | "全部"+ 正常分组 + "已停用"分组（DISABLED / CLOSED / REVOKED / 未知状态） |
| 200 空集 | 下拉禁用，提示"暂无可见门店" |
| 403 | 下拉禁用，提示"无门店查看权限"；列表本身是否可查由列表接口自己的权限决定 |
| 422 超限 | 切换为远程搜索框，调用已批准的 038 分页目录 `keyword`，提示"门店较多，请输入关键字" |
| 501 / 5xx | 下拉禁用，提示"门店选项加载失败"+ 重试；URL 中已有的筛选仍生效，以"门店 ID：xxx"显示 |

- 停用资源可选，用于查询历史数据；**写场景**（如新建门店关联、新建退款）不使用 options 选择停用资源。
- URL 中的 `storeId` 不在 options 中：保留筛选，显示"未知门店（st_x）"并可一键清除，不自动丢弃，不按名称猜测。

#### 3.2.4 切换后清理

- 切换当前 App（应用选择器）：重置 `page=1`；清除依赖 App 的筛选（门店、渠道之外的 App 级条件）；若新 App 下的门店 options 不含当前 `storeId`，清除并提示"已清除不适用的门店筛选"；保留日期范围和状态。
- 切换门店筛选：重置 `page=1`，保留其他条件。
- options 刷新后集合变化：不自动修改已选条件，只按上表标注"未知门店"。

### 3.3 全局 search

`GET <search>?keyword=`（URL 待后台定）

```json
{
  "viewVersion": "portal-global-search-view/0.1-draft",
  "keyword": "P2026",
  "asOf": "2026-11-15T06:30:00.000Z",
  "groups": [
    { "type": "payment", "status": "OK", "truncated": false, "items": [
      { "id": "pay_1", "merchantOrderNo": "P2026...", "storeName": null, "amount": "128.00", "currency": "CNY", "status": "SUCCESS", "coreStatus": "PART_REFUNDED", "createdAt": "..." }
    ]},
    { "type": "refund", "status": "FORBIDDEN", "truncated": false, "items": [] },
    { "type": "store", "status": "OK", "truncated": false, "items": [] }
  ]
}
```

| 类型 | 匹配 | 命中字段（最小） | 跳转 |
| --- | --- | --- | --- |
| payment | `id`、`merchantOrderNo` 精确 | `id, merchantOrderNo\|null, storeName\|null, amount, currency, status, coreStatus, createdAt` | `/payments/{id}` |
| refund | `id`、`merchantRefundNo` 精确 | `id, paymentId, merchantRefundNo\|null, amount, status, createdAt` | `/refunds/{id}` |
| store | `storeNo`、`merchantStoreNo` 精确；`name` 包含 | `id, storeNo, merchantStoreNo\|null, name, status` | `/stores/{id}` |

- 输入：去除首尾空白后为空不发请求；长度 < 2 时只做精确匹配类型（如后台不支持则不发请求，待确认）；> 64 返回 `VALIDATION`。
- 每组最多 5 条，`truncated=true` 表示还有更多，页面提供"在列表中查看"（跳到对应列表页带关键字）。
- 组顺序固定 payment → refund → store；组内精确命中优先，其次 `createdAt` 降序。
- `groups` 必须恰好包含三类各一次；`status ∈ {OK, FORBIDDEN, UNAVAILABLE}`，非 OK 时 `items` 必须为空。
- 服务端不再返回 `title/subtitle/to`；前端用 `type + id` 派生路由，用事实字段派生文案。
- 不可见与不存在不可区分：都不出现条目；`FORBIDDEN` 只表示"此类整体没有权限"，与具体关键字无关。

### 3.4 写响应

#### 3.4.1 退款（`POST /refunds`）

| 结果 | 判定 | 页面 |
| --- | --- | --- |
| 确定拒绝 | 4xx 业务错误（`VALIDATION`、`REFUND_NOT_ALLOWED`、`AMOUNT_EXCEEDED` 等），Core 保证未创建 | 显示原因，保留表单和退款号，允许修改后提交 |
| 未受理 | 仅当错误明确带"未受理"保证（提案 `notAccepted: true`，待 Core 确认可提供） | 同上，可原号重试 |
| 已受理 | 2xx 回执 | 跳转退款详情，再读取 038 退款视图；回执不等于完整详情 |
| 未知 | 超时、网络中断、5xx、无保证的错误、回执格式错误 | 显示"结果待确认"；只提供"按退款号查询"（038 精确查询，两键匹配）；404 仍为待确认；不自动重发、不换号、不开放新建 |

回执提案：

```json
{ "viewVersion": "portal-refund-receipt/0.1-draft", "id": "rf_1", "paymentId": "pay_1", "merchantRefundNo": "R001", "status": "PROCESSING", "acceptedAt": "..." }
```

回执中的 `paymentId` / `merchantRefundNo` 必须与请求一致，否则按未知处理。是否允许用户手动"以同一退款号重新提交"取决于 Core 的幂等重放语义（待确认），在确认前不提供该按钮。

#### 3.4.2 门店

- 创建：请求带 `requestId`（幂等键）；响应为 038 门店视图 + `version`。
- 更新：请求带 `version`；冲突返回 `409 CONFLICT`，页面提示"门店已被修改，请刷新后再编辑"，不自动覆盖。
- 重复提交：同一 `requestId` 返回同一结果；不同 `requestId` 但 `merchantStoreNo` 冲突返回 `409 DUPLICATE`。
- 响应丢失：显示"提交结果未知"，提供"刷新列表"和按 `merchantStoreNo` 精确查找；不自动重发。
- 编辑入口继续关闭，直到写契约与完整编辑读源评审通过（V051-5）。

#### 3.4.3 Key

- 创建 / 轮换响应：`{ keyId, prefix, status, createdAt, secret }`，`secret` 只出现在这一次响应中。
- 前端：秘密只在一次性弹窗中显示，关闭即从内存清除；不进入列表、路由、日志、错误提示、埋点或 Mock 持久化。
- 响应丢失：页面显示"密钥可能已创建，但秘密未送达"，引导用户在列表中找到 `createdAt` 最近且未确认的 Key 并吊销，再新建。
- 需要 Core 确认（二选一）：
  - A：支持幂等键，重放返回同一 `keyId` 但**不再返回秘密**，并带 `secretDelivered: false` 以便页面直接引导吊销；
  - B：不支持重放，页面只能按上面的列表引导处理。

#### 3.4.4 Webhook

| 事实 | 最小字段 | 页面 |
| --- | --- | --- |
| 配置保存 | 配置视图 + `version`；签名密钥同 Key 规则一次性展示 | 409 冲突提示刷新 |
| 测试请求 | `{ testId, acceptedAt, status: "ACCEPTED" }` | 只显示"测试请求已受理"；若无测试结果查询能力，不显示"已送达" |
| 投递记录 | `eventId, eventType, createdAt, status, attemptCount, lastAttemptAt\|null, isTest` | 测试投递单独标注，不混入真实事件统计 |
| attempt | `attemptNo, startedAt, httpStatus\|null, durationMs\|null, errorCategory\|null` | 来源未交付前显示"投递明细暂不可用"，不用 `attemptCount` 或最后错误拼造历史 |

#### 3.4.5 近期认证（产品需求提案）

- 需要近期认证的操作：新建 / 轮换 / 吊销 Key、修改 Webhook 地址或签名密钥、发起退款。
- 期望：服务端返回 `403 STEP_UP_REQUIRED`（提案），页面弹出重新验证（密码或二次验证），成功后由用户再次点击提交，使用同一幂等键。
- 不使用 `lastActiveAt` 判断近期认证；认证有效期由 identity 决定。

### 3.5 聚合页面

#### 3.5.1 时间口径

- 首批固定 `+08:00`；每个报表响应回显 `"timezone": "+08:00"`，页面标注"北京时间（UTC+8）"，不读取浏览器或服务器本机时区。
- 今日：`[今日 00:00+08, asOf)`。
- 昨日同时段：`[昨日 00:00+08, 昨日 00:00+08 + (asOf − 今日 00:00+08))`。
- 7 / 30 日：自然日，含今天，即 `今天−6 … 今天`；今天只统计到 `asOf`；无数据日期返回 0 值点（完整授权空集合时）。
- 日期筛选 `from` / `to` 均为包含日期，后台转换为 UTC 半开区间 `[from 00:00+08, (to+1) 00:00+08)`；`to` 为今天时上界为 `asOf`；响应回显实际区间 `rangeStart` / `rangeEnd`（UTC）。
- 环比：与紧邻的上一等长周期比较；今日对比昨日同时段。
- 同比（不进首批，供产品确认）：按日历日期减一年；2 月 29 日对应上一年 2 月 28 日；跨年区间按每个日期分别映射。

#### 3.5.2 比较值

- 服务端返回上期原始值，前端计算展示：

```json
"previous": { "rangeStart": "...", "rangeEnd": "...", "successAmount": "100.00", "successCount": "3", "refundAmount": "0.00", "refundCount": "0", "terminalCount": "4", "createdSuccessCount": "3" }
```

- 金额 / 计数：相对变化 `(本期 − 上期) / 上期`，乘 100，保留 1 位小数，四舍五入（远离零），带正负号（`+12.3%` / `−5.0%` / `0.0%`）。
- successRate：显示百分点差，保留 1 位小数，如 `+0.4 个百分点`。
- 展示规则：

| 情况 | 显示 |
| --- | --- |
| 上期 = 0，本期 > 0 | "—"，提示"上期为 0" |
| 上期 = 0，本期 = 0 | "—" |
| 上期 > 0，本期 = 0 | `−100.0%` |
| 任一期 `terminalCount = 0`（successRate） | "—" |
| `previous` 缺失 / 上期数据未知 | "暂无对比"（与"—"区分） |

#### 3.5.3 精确数值

- 报表计数改为 `CountString`，金额为 `AmountDecimal`，`successRate` 返回 `{ "numerator": "1531", "denominator": "1574" }`，`avgAmount` 由服务端按十进制计算并四舍五入两位（V0 约定：笔数为 0 时 `"0.00"`）。
- 现有约定"`terminalCount = 0` 时 successRate 为 0"：服务端仍可如此返回，但页面在分母为 0 时显示"—"，避免把"无终态订单"显示成"成功率 0%"（**建议修改**，待产品确认）。
- 显示：金额完整显示两位小数并千分位分组；卡片中 ≥ 1 亿显示为 `1.23 亿`（截断不四舍五入，避免夸大），tooltip 显示完整原值；计数千分位分组，≥ 1 亿同样缩写并 tooltip 原值。
- 图表：仅在传给图表库时转换为 Number（可能损失精度），坐标轴使用缩写；tooltip 始终显示原始字符串。超过 `2^53` 的值在图表中按比例近似，页面不据此做任何计算。

#### 3.5.4 空集合与未知

- 完整授权空集合：显示 0 / 0.00，趋势为连续 0 点。
- 403 / 501 / 503 / 格式错误：对应卡片或图表显示状态文字，不显示 0、不显示空图表。
- `byChannel`：未知渠道按原值显示"未知（原值）"。
- `byStore`：
  - `storeId: null`（EXTERNAL 无门店）作为独立分组"未关联门店"；
  - 活跃门店零交易需要展示（值 0）；
  - 停用 / 关闭门店仅在区间内有数据时展示，并标注状态。
  - 实际归属与历史读取政策由 Core / 产品确认。

#### 3.5.5 asOf 与一致性

- 每个报表对象带 `asOf`、`timezone`、`rangeStart`、`rangeEnd`；不返回裸数组。
- 页面每个组件各自显示"更新于 HH:mm:ss"；同屏组件 `asOf` 相差超过 60 秒时显示提示"各模块数据更新时间不同"。
- "刷新"按钮重新请求全部组件，期间保留旧数据并显示加载状态；单个组件失败不影响其他组件。
- 页面说明"历史日期数据可能因迟到事实更新"，不承诺历史值不变。
- 若后台使用投影：需要额外字段 `freshness: { source: "PRIMARY" | "PROJECTION", watermark }`（提案，待后台）；页面显示"数据截至 watermark"，不把投影水位显示为当前时间。

#### 3.5.6 processing（V0 期望，待确认）

- 当前快照计数，不受日期筛选影响；受门店 / App 范围限制；不做比较。
- 支付与退款分开返回：`{ payingCount, refundProcessingCount }`（CountString），页面合计显示时用 BigInt 相加并可展开查看两项。

#### 3.5.7 报表包装示例（提案）

```json
{
  "viewVersion": "portal-dashboard-summary-view/0.1-draft",
  "asOf": "2026-11-15T06:30:00.000Z",
  "timezone": "+08:00",
  "rangeStart": "2026-11-14T16:00:00.000Z",
  "rangeEnd": "2026-11-15T06:30:00.000Z",
  "current": { "successAmount": "128734.00", "successCount": "1532", "refundAmount": "2300.00", "refundCount": "12", "totalCount": "1620", "terminalCount": "1574", "createdSuccessCount": "1531" },
  "previous": { "rangeStart": "...", "rangeEnd": "...", "successAmount": "...", "successCount": "...", "refundAmount": "...", "refundCount": "...", "totalCount": "...", "terminalCount": "...", "createdSuccessCount": "..." },
  "processing": { "payingCount": "3", "refundProcessingCount": "5" }
}
```

`successRate`、`avgAmount` 可由前端从 `current` 精确计算，服务端不必重复返回（待后台选择）。趋势、渠道、交易统计、门店统计同样采用 `viewVersion + asOf + timezone + 区间 + 数据字段` 结构，各自另起版本号。

---

## 4. 受影响页面、组件与 Mock

| 范围 | 文件 |
| --- | --- |
| 工作台 | `src/pages/dashboard/DashboardPage.vue`、`src/composables/useTradeCharts.ts`、`src/composables/useChartTheme.ts` |
| 交易统计 | `src/pages/analytics/AnalyticsPage.vue` |
| 门店统计 | `src/pages/stores/StoreDetailPage.vue` |
| options | `src/pages/payments/PaymentListPage.vue`、`src/pages/refunds/RefundListPage.vue`、`src/composables/useQueryFilters.ts`、`src/composables/useAppPicker.ts`、`src/components/business/AppPickerStatus.vue` |
| search | `src/components/layout/GlobalSearch.vue`、`src/layouts/AppLayout.vue` |
| 退款写 | `src/components/business/CreateRefundDialog.vue`、`src/services/refund/classify.ts`、`src/services/refund/recovery.ts` |
| 门店写 | `src/components/business/StoreFormDrawer.vue`、`src/pages/stores/StoreListPage.vue` |
| Key | `src/pages/developer/ApiKeysPage.vue` |
| Webhook | `src/pages/developer/WebhookConfigPage.vue`、`src/pages/developer/WebhookDeliveriesPage.vue`、`src/components/business/WebhookDeliveryList.vue`、`WebhookStatusBadge.vue` |
| 近期认证 | `src/pages/settings/SecurityPage.vue`、`src/services/api/withAuth.ts` |
| 数值显示 | `src/components/business/MoneyDisplay.vue`，新增计数 / 比率格式化工具（`src/utils/`） |
| 类型与接口层 | `src/services/api/types.ts`、`src/services/api/index.ts`、`src/services/http/api.ts`（严格校验器） |
| Mock | `src/services/mock/api.ts`、`src/services/mock/db.ts`、`src/services/mock/control.ts`（需能注入：未交付、403、超限、部分类型无权限、超大计数、不同 asOf、Key 响应丢失） |
| 文档 | `docs/merchant-portal-api.md` 5.1 / 5.4 / 5.5 / 5.7 / 5.9 |

---

## 5. 验收向量

✓ = 应接受并按说明展示；✗ = 应判为格式错误或拒绝。

| # | 场景 | 输入 | 期望 |
| --- | --- | --- | --- |
| 1 | EXTERNAL null | recent 项 `source: EXTERNAL, storeId: null, storeName: null, merchantOrderNo: null` | ✓ 门店显示"—"，单号显示平台单号 |
| 2 | 未交付字段复活 | recent 项多出 `paidAmount: "0.00"` | ✗ 格式错误 |
| 3 | 22 字段缺一 | recent 项缺 `refundAggregate` | ✗ |
| 4 | recent 乱序 | `createdAt` 非降序 | ✗ |
| 5 | recent 未交付 | 501 | ✓ "暂未开放"，不是"暂无支付" |
| 6 | 超安全整数计数 | `successCount: "9007199254740993"` | ✓ 原值完整显示（tooltip），不变成 …992 |
| 7 | 计数用 Number | `successCount: 1532` | ✗（提案要求字符串） |
| 8 | 计数越 u64 | `"18446744073709551616"` | ✗ |
| 9 | 超单笔上限金额 | `successAmount: "123456789012345.67"` | ✓ 完整显示，卡片"1234567.89 亿"，不报单笔超限 |
| 10 | 金额精度 | `"0.1"` 或 `"1.234"` | ✗ |
| 11 | 零分母成功率 | `terminalCount: "0"` | ✓ 显示"—"，不是 0%，不是 NaN |
| 12 | 上期为 0 | 上期 `successAmount: "0.00"`，本期 `"10.00"` | ✓ 比较显示"—" |
| 13 | 本期为 0 | 上期 `"10.00"`，本期 `"0.00"` | ✓ `−100.0%` |
| 14 | 比较未知 | 无 `previous` | ✗（字段严格）；若协议允许 `previous: null` 则显示"暂无对比" |
| 15 | 完整空集合 | 200，全部计数 `"0"` | ✓ 显示 0，趋势连续 0 点 |
| 16 | 无权限 | 报表 403 | ✓ 显示"无统计查看权限"，不显示 0 |
| 17 | 跨日 | `asOf = 2026-11-15T16:00:00Z`（+08 次日 00:00） | ✓ "今日"为 11-16，区间长度 0，全部 0，比较"—" |
| 18 | 跨年分桶 | `from 2026-12-28, to 2027-01-03, granularity=week` | ✓ key 唯一，首桶 `2026-12-28`，不按 label 排序 |
| 19 | 同比闰日 | 2028-02-29 同比 | ✓ 对应 2027-02-28（首批不实现，仅规则确认） |
| 20 | 不同 asOf | summary 与 trend 的 `asOf` 相差 5 分钟 | ✓ 各自显示更新时间并提示时间不同 |
| 21 | 时区缺失 | 报表无 `timezone` 或为 `+09:00` | ✗ / 显示"时区不受支持" |
| 22 | 部分类型无权限 | search refund 组 `FORBIDDEN` | ✓ 显示"无权限，未搜索退款"，其他组正常 |
| 23 | 非 OK 组带条目 | `FORBIDDEN` 组 `items` 非空 | ✗ |
| 24 | search 缺组 | `groups` 少 store | ✗ |
| 25 | 不存在 vs 不可见 | 搜索他商户订单号 | ✓ 与不存在完全相同（OK 组空） |
| 26 | options 超限 | 422 `OPTIONS_LIMIT_EXCEEDED` | ✓ 切换远程搜索，不显示部分列表 |
| 27 | options 重复 id | 两项同 `id` | ✗ |
| 28 | URL 中未知门店 | `storeId=st_x` 不在 options | ✓ 显示"未知门店（st_x）"，保留筛选 |
| 29 | 退款未知结果 | 提交超时 | ✓ "结果待确认"，无自动重发、无换号、无新建入口 |
| 30 | 退款未知后精确查询 404 | 两键查询 404 | ✓ 仍"待确认" |
| 31 | 退款回执不一致 | 回执 `merchantRefundNo` 与请求不同 | ✓ 按未知处理 |
| 32 | Key 响应丢失 | 创建请求超时 | ✓ 提示可能已创建，引导吊销后重建；不尝试再次读取秘密 |
| 33 | Key 秘密泄露 | 列表响应含 `secret` | ✗ 格式错误，且不写入错误详情 |
| 34 | Webhook 测试 | 测试回执 `ACCEPTED` | ✓ 显示"已受理"，不显示"已送达" |
| 35 | attempt 未交付 | 投递明细 501 | ✓ "投递明细暂不可用"，不拼造 |
| 36 | 门店更新冲突 | 409 CONFLICT | ✓ 提示刷新，不自动覆盖 |
| 37 | 近期认证 | 403 `STEP_UP_REQUIRED` | ✓ 弹出重新验证，成功后需用户再次点击 |
| 38 | HTTP 失败不回退 | HTTP 模式下 503 | ✓ 显示错误，不显示 Mock 数据 |

---

## 6. 需后台 / Core / 产品决策

1. 成功金额口径：订单金额还是其他权威收款事实（影响 P 集合金额、`avgAmount`、渠道占比）。
2. 退款发起 App 与原支付 App 不同时，R 集合按哪个 App 授权、筛选和分组。
3. analytics 与 `payments.read` / `refunds.read` 的权限交集；只有其中一种权限时，summary 是整体拒绝还是部分字段不可见（V0 倾向整体 403，避免分子分母来自不同授权集合）。
4. 聚合金额 / 计数硬上限、查询跨度和数据库预算；options 上限（提案门店 1000、App 200）。
5. 报表计数改为字符串、`successRate` 改为分子 / 分母、比较值改为上期原始值是否接受。
6. `successRate` 分母为 0 时页面显示"—"（而非 0%）是否接受。
7. 首批固定 `+08:00` 是否接受；是否需要同比。
8. processing 是否不受日期筛选影响，是否拆分支付 / 退款两项。
9. search：短输入（< 2）是否支持精确单号；门店名称包含匹配是否可实现；每组 5 条是否可接受。
10. 退款"未受理"保证能否提供；同一退款号手动重提的幂等语义。
11. Key 响应丢失采用方案 A 还是 B。
12. Webhook 测试结果是否可查询；attempt 历史来源与交付时间。
13. 近期认证的操作范围、有效期和验证方式（identity）。
14. 投影来源的水位字段。
15. 新 operationId、URL、签名 profile、包版本号。

评审通过后，V0 再按批准范围修改类型、校验器、Mock 和页面；在此之前现有页面保持旧模型，不声明这些能力已可用。
