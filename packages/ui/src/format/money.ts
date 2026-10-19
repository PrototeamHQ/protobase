import { cachedFormat } from './intl-cache'

const formatterFor = (currency: string, decimals: number | undefined) =>
  cachedFormat(`money:${currency}:${decimals ?? ''}`, (tag) => new Intl.NumberFormat(tag, { style: 'currency', currency, ...(decimals !== undefined && { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) }))

/** An amount in cents in the currency, with its usual decimals or `decimals` of them. */
export const formatMoney = (cents: number, currency = 'EUR', decimals?: number) => formatterFor(currency, decimals).format(cents / 100)
