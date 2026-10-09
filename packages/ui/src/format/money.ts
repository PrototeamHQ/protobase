const formatters = new Map<string, Intl.NumberFormat>()

const formatterFor = (currency: string) => {
  const cached = formatters.get(currency)
  if (cached) return cached
  const created = new Intl.NumberFormat('en-IE', { style: 'currency', currency })
  formatters.set(currency, created)
  return created
}

export const formatMoney = (cents: number, currency = 'EUR') => formatterFor(currency).format(cents / 100)
