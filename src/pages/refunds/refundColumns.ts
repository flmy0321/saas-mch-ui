import { h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import OrderNumber from '@/components/business/OrderNumber.vue'
import MoneyDisplay from '@/components/business/MoneyDisplay.vue'
import RefundStatusBadge from '@/components/business/RefundStatusBadge.vue'
import { formatDateTime } from '@/utils/format'
import type { Refund } from '@/types'

const muted = (text: string) => h('span', { class: 'text-muted-foreground tabular whitespace-nowrap' }, text)

export function buildRefundColumns(opts: { sortable?: boolean; withPayment?: boolean } = {}): ColumnDef<Refund>[] {
  const sortable = opts.sortable ?? false
  const cols: ColumnDef<Refund>[] = [
    {
      id: 'id',
      header: '平台退款编号',
      enableSorting: false,
      cell: ({ row }) => h(OrderNumber, { value: row.original.id, to: `/refunds/${row.original.id}` }),
    },
    {
      id: 'merchantRefundNo',
      header: '商户退款编号',
      enableSorting: false,
      cell: ({ row }) => h(OrderNumber, { value: row.original.merchantRefundNo, muted: true }),
    },
  ]
  if (opts.withPayment !== false) {
    cols.push({
      id: 'paymentId',
      header: '原支付订单号',
      enableSorting: false,
      cell: ({ row }) => h(OrderNumber, { value: row.original.paymentId, to: `/payments/${row.original.paymentId}` }),
    })
  }
  cols.push(
    {
      id: 'amount',
      header: '退款金额',
      enableSorting: sortable,
      meta: { align: 'right' },
      cell: ({ row }) => h(MoneyDisplay, { amount: row.original.amount, class: 'font-medium' }),
    },
    {
      id: 'status',
      header: '退款状态',
      enableSorting: false,
      cell: ({ row }) => h(RefundStatusBadge, { status: row.original.status }),
    },
    {
      id: 'createdAt',
      header: '创建时间',
      enableSorting: sortable,
      cell: ({ row }) => muted(formatDateTime(row.original.createdAt)),
    },
    {
      id: 'finishedAt',
      header: '退款完成时间',
      enableSorting: sortable,
      cell: ({ row }) => muted(formatDateTime(row.original.finishedAt)),
    },
  )
  return cols
}
