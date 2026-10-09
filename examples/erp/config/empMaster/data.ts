import { f, resource } from '@protobase/schema'
import { erpAccess, roles } from '../roles'

/** hr.EMP_MASTER */
export const empMaster = resource('empMaster')
  .table('hr.EMP_MASTER')
  .fields({
    empId: f.integer().column('EMP_ID').filterable().sortable(),
    organizationId: f.relation('organizations').column('ORGANIZATION_ID').filterable().sortable(),
    empName: f.text().column('EMP_NAME'),
    deptCd: f.text().column('DEPT_CD'),
    hireDt: f.date().column('HIRE_DT'),
    salAmt: f.decimal({ precision: 10, scale: 2 }).optional().column('SAL_AMT').access({ read: roles.is('admin') }),
    mgrId: f.relation('empMaster').optional().column('MGR_ID').filterable().sortable(),
    activeFlg: f.enum(['Y', 'N']).default('Y').column('ACTIVE_FLG'),
  })
  .primaryKey((r) => r.empId)
  .tenant((r) => r.organizationId)
  .access(erpAccess('empMaster'))
