import type { ResourceModel } from '@protobase/schema'

/** The field that holds when a record was created or last updated: `created_at` or `createdAt`, as the model names it. */
export const auditField = (model: ResourceModel, kind: 'created' | 'updated') => [`${kind}_at`, `${kind}At`].find((name) => model.fields[name])
