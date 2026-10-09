import { stringValue, type ToParam } from './sql-common'

export const toParam: ToParam = (value, field) => stringValue(value, field, 'an ISO 3166-1 country code')
