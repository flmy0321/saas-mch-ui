/** int total 列表的末页页码；total = 0 时为 1（3.8.3 空结果回写 page = 1） */
export function lastPageOf(total: number, pageSize: number): number {
  return total === 0 ? 1 : Math.ceil(total / pageSize)
}

/**
 * 回写的 page/pageSize/total 与本页行数是否自洽（1.4 / 3.8.3）：
 * - total = 0：page 必为 1、items 为空；
 * - total > 0：page 不超过末页；非末页必须满页，末页行数必须等于 total 余量。
 * 不自洽说明响应畸形或分页期间数据变化，调用方不得据此推断“已到底”。
 */
export function isConsistentPage(total: number, page: number, pageSize: number, rows: number): boolean {
  if (total === 0) return page === 1 && rows === 0
  const last = lastPageOf(total, pageSize)
  if (page > last) return false
  const expected = page < last ? pageSize : total - (last - 1) * pageSize
  return rows === expected
}
