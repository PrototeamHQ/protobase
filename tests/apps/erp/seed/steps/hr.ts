import type { Db } from '../../db/connection'
import { DAY, windowEnd } from '../calendar'
import { copyRows } from '../copy'
import { locales } from '../data/names'
import { isoDate, money, row } from '../format'
import { int, pick, rngAt } from '../rng'
import { employeesPerOrg, type World } from '../world'

const departments = ['SAL', 'FIN', 'WHS', 'ADM', 'PUR']
const managers = 3

function* employeeRows(world: World) {
  for (const org of world.orgs) {
    const locale = locales[org.country]
    for (let k = 0; k < employeesPerOrg; k++) {
      const rand = rngAt(org.seed + 8, k)
      const name = `${pick(rand, locale.surnames)}, ${pick(rand, locale.firstNames)}`.toUpperCase()
      const managerId = k < managers ? null : org.employeeFirstId + int(rand, 0, managers - 1)
      const hired = windowEnd - int(rand, 30, 15 * 365) * DAY
      yield row(org.employeeFirstId + k, org.id, name, pick(rand, departments), isoDate(hired), money(int(rand, 2_800_000, 9_500_000)), managerId, rand() < 0.92 ? 'Y' : 'N')
    }
  }
}

export const seedHr = (sql: Db, world: World) =>
  copyRows(sql, 'hr."EMP_MASTER" ("EMP_ID", "ORGANIZATION_ID", "EMP_NAME", "DEPT_CD", "HIRE_DT", "SAL_AMT", "MGR_ID", "ACTIVE_FLG")', employeeRows(world))
