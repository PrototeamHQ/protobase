import { view } from '@protobase/schema'
import type { empMaster } from './data'

export const empMasterView = view<typeof empMaster>('emp_master')
  .names({ singular: 'Emp master', plural: 'Emp master' })
  .fields((r) => ({ active_flg: r.active_flg.label('Active').valueLabels({ Y: 'Yes', N: 'No' }) }))
  .list((r) => ({ columns: [r.emp_name, r.dept_cd, r.hire_dt, r.sal_amt, r.active_flg] }))
