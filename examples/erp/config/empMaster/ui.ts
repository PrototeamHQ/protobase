import { view } from '@protobase/schema'
import type { empMaster } from './data'

export const empMasterView = view<typeof empMaster>('empMaster')
  .names({ singular: 'Emp master', plural: 'Emp master' })
  .fields((r) => ({ activeFlg: r.activeFlg.label('Active').valueLabels({ Y: 'Yes', N: 'No' }) }))
  .list((r) => ({ columns: [r.empName, r.deptCd, r.hireDt, r.salAmt, r.activeFlg] }))
