import { h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import OrderNumber from '@/components/business/OrderNumber.vue'
import MoneyDisplay from '@/components/business/MoneyDisplay.vue'
import ChannelBadge from '@/components/business/ChannelBadge.vue'
import PaymentStatusBadge from '@/components/business/PaymentStatusBadge.vue'
import RefundAggregateBadge from '@/components/business/RefundAggregateBadge.vue'
import { methodLabel } from '@/utils/dictionaries'
import { formatDateTime } from '@/utils/format'
import type { Payment } from '@/types'

export type PaymentColumnId =
  | 'id'
  | 'merchantOrderNo'
  | 'storeName'
  | 'amount'
  | 'channel'
  | 'method'
  | 'status'
  | 'createdAt'
  | 'paidAt'

export const PAYMENT_COLUMN_LABELS: Record<PaymentColumnId, string> = {
  id: '平台支付订单号',
  merchantOrderNo: '商户订单号',
  storeName: '门店',
  amount: '订单金额',
  channel: '支付渠道',
  method: '支付方式',
  status: '支付状态',
  createdAt: '创建时间',
  paidAt: '支付时间',
}

const muted = (text: string) => h('span', { class: 'text-muted-foreground tabular whitespace-nowrap' }, text)

/** 支付订单表格列定义（列表页、门店详情、工作台共用，保证一致的展示方式） */
export function buildPaymentColumns(opts: { sortable?: boolean; include?: PaymentColumnId[] } = {}): ColumnDef<Payment>[] {
  const sortable = opts.sortable ?? false
  const all: ColumnDef<Payment>[] = [
    {
      id: 'id',
      header: PAYMENT_COLUMN_LABELS.id,
      enableSorting: false,
      cell: ({ row }) => h(OrderNumber, { value: row.original.id, to: `/payments/${row.original.id}` }),
    },
    {
      id: 'merchantOrderNo',
      header: PAYMENT_COLUMN_LABELS.merchantOrderNo,
      enableSorting: false,
      cell: ({ row }) =>
        row.original.merchantOrderNo ? h(OrderNumber, { value: row.original.merchantOrderNo, muted: true }) : muted('—'),
    },
    {
      id: 'storeName',
      header: PAYMENT_COLUMN_LABELS.storeName,
      enableSorting: false,
      cell: ({ row }) => row.original.storeName ? h('span', { class: 'whitespace-nowrap' }, row.original.storeName) : muted('—'),
    },
    {
      id: 'amount',
      header: PAYMENT_COLUMN_LABELS.amount,
      enableSorting: sortable,
      meta: { align: 'right' },
      cell: ({ row }) =>
        h('div', { class: 'flex flex-col items-end gap-1' }, [
          h(MoneyDisplay, { amount: row.original.amount, class: 'font-medium' }),
          row.original.refundAggregate !== 'NONE' ? h(RefundAggregateBadge, { payment: row.original }) : null,
        ]),
    },
    {
      id: 'channel',
      header: PAYMENT_COLUMN_LABELS.channel,
      enableSorting: false,
      cell: ({ row }) => h(ChannelBadge, { channel: row.original.channel }),
    },
    {
      id: 'method',
      header: PAYMENT_COLUMN_LABELS.method,
      enableSorting: false,
      cell: ({ row }) => muted(methodLabel(row.original.method)),
    },
    {
      id: 'status',
      header: PAYMENT_COLUMN_LABELS.status,
      enableSorting: false,
      cell: ({ row }) => h(PaymentStatusBadge, { status: row.original.status }),
    },
    {
      id: 'createdAt',
      header: PAYMENT_COLUMN_LABELS.createdAt,
      enableSorting: sortable,
      cell: ({ row }) => muted(formatDateTime(row.original.createdAt)),
    },
    {
      id: 'paidAt',
      header: PAYMENT_COLUMN_LABELS.paidAt,
      enableSorting: sortable,
      cell: ({ row }) => muted(formatDateTime(row.original.paidAt)),
    },
  ]
  return opts.include ? all.filter((c) => opts.include!.includes(c.id as PaymentColumnId)) : all
}
