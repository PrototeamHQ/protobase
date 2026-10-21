import type { RebindOption } from '@protobase/server'

export type RebindFlags = { rebind?: string; fromTable?: string; fromColumn?: string }

/** `--rebind <resource>[.<field>]` with `--from-table` or `--from-column`, checked before anything is written. */
export const rebindOption = ({ rebind, fromTable, fromColumn }: RebindFlags): RebindOption | undefined => {
  if (rebind === undefined) {
    if (fromTable !== undefined || fromColumn !== undefined) throw new Error('--from-table and --from-column go with --rebind <resource>[.<field>]')
    return undefined
  }
  const [resource, field, ...rest] = rebind.split('.')
  if (!resource || field === '' || rest.length > 0) throw new Error(`--rebind takes <resource> or <resource>.<field>, not "${rebind}"`)
  if (fromTable === undefined && fromColumn === undefined) throw new Error('--rebind needs --from-table <table> or --from-column <column>: where the values were before')
  if (fromColumn !== undefined && field === undefined) throw new Error('--from-column needs the field whose column was renamed: --rebind <resource>.<field>')
  return {
    resource,
    ...(field !== undefined && { field }),
    from: { ...(fromTable !== undefined && { table: fromTable }), ...(fromColumn !== undefined && { column: fromColumn }) },
  }
}
