import { f, resource } from '@protobase/schema'
import { erpAccess, roles } from '../roles'

/** hr.EMP_MASTER */
export const empMaster = resource('emp_master')
  .table('hr.EMP_MASTER')
  .fields({
    emp_id: f.integer().column('EMP_ID').filterable().sortable(),
    organization_id: f.relation('organizations').column('ORGANIZATION_ID').filterable().sortable(),
    emp_name: f.text().column('EMP_NAME'),
    dept_cd: f.text().column('DEPT_CD'),
    hire_dt: f.date().column('HIRE_DT'),
    sal_amt: f.decimal({ precision: 10, scale: 2 }).optional().column('SAL_AMT').access({ read: roles.is('admin') }),
    mgr_id: f.relation('emp_master').optional().column('MGR_ID').filterable().sortable(),
    active_flg: f.enum(['Y', 'N']).default('Y').column('ACTIVE_FLG'),
  })
  .primaryKey((r) => r.emp_id)
  .tenant((r) => r.organization_id)
  .access(erpAccess('emp_master'))
