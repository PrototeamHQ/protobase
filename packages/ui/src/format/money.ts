const formatters = new Map<string, Intl.NumberFormat>()

const formatterFor = (currency: string, decimals: number | undefined) => {
  const key = `${currency}:${decimals ?? ''}`
  const cached = formatters.get(key)
  if (cached) return cached
  const created = new Intl.NumberFormat('en-IE', { style: 'currency', currency, ...(decimals !== undefined && { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) })
  formatters.set(key, created)
  return created
}

/** An amount in cents in the currency, with its usual decimals or `decimals` of them. */
export const formatMoney = (cents: number, currency = 'EUR', decimals?: number) => formatterFor(currency, decimals).format(cents / 100)
