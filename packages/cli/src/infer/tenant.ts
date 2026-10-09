const tenantColumn = /^(organization|tenant)_id$/i

export const isTenantColumn = (column: string) => tenantColumn.test(column)
