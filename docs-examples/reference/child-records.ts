import { defineRoles, f, resource } from '@protobase/schema'

// Virtual machines and the operations run on them: a member creates an operation only on a VM they may update.

export const roles = defineRoles<'vms' | 'operations'>({
  admin: ['*'],
  member: ['vms.read', 'vms.update.own', 'operations.read', 'operations.create'],
})

/** virt.vms, each owned by the user who made it. */
export const vms = resource('vms')
  .table('virt.vms')
  .fields({
    id: f.integer().readOnly().filterable().dbDefault(),
    name: f.text().filterable(),
    owner_id: f.text().readOnly().filterable(),
  })
  .primaryKey((r) => r.id)
  .owner((r) => r.owner_id)

/** virt.operations: writing one needs `update` on the VM its `vm_id` points at. */
export const operations = resource('operations')
  .table('virt.operations')
  .fields({
    id: f.integer().readOnly().filterable().dbDefault(),
    vm_id: f.relation('vms').filterable(),
    kind: f.enum(['start', 'stop', 'reboot']),
  })
  .primaryKey((r) => r.id)
  .parent((r) => r.vm_id, 'update')
