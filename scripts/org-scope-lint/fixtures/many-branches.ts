import { sql } from 'kysely'

export const filters = (on: boolean[]) =>
  sql.raw('select * from x where true' + (on[0] ? ' and a' : '') + (on[1] ? ' and b' : '') + (on[2] ? ' and c' : '') + (on[3] ? ' and d' : '') + (on[4] ? ' and e' : '') + (on[5] ? ' and f' : '') + (on[6] ? ' and g' : ''))
