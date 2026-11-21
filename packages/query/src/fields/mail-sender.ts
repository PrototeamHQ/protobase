import { stringValue, type ToParam } from './sql-common'

export const toParam: ToParam = (value, field) => stringValue(value, field, 'a mail address')
