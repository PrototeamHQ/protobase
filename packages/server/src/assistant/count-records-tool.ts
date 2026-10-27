import { exactCountLimit } from '../list-service'
import { invalidShowDeleted, refused, resourceOf, resourceParameter, showDeletedOf, showDeletedParameter } from './record-tool-args'
import { defineTool, type ToolContext } from './tools'

const maxGroups = 1000

const invalid = (parameter: string, message: string) => JSON.stringify({ error: 'invalid-parameter', message: `Invalid parameter ${parameter}: ${message}` })

// A list's `count=exact` of one record a page: the record is read but not returned, and above the limit only the
// planner's estimate is known.
const total = async (context: ToolContext, resource: string, filter: string | undefined, showDeleted: boolean) => {
  const page = await context.records.list(resource, { ...(filter !== undefined && { filter }), page_size: 1, count: 'exact', ...(showDeleted && { show_deleted: true }) })
  if (page.total_size !== undefined) return { count: page.total_size }
  return { more_than: exactCountLimit, estimate: page.total_size_estimate }
}

/** Counts a resource's records, in all or per value of a field, through the REST API's `count=exact` and `:aggregate`. */
export const countRecordsTool = () =>
  defineTool({
    name: 'count_records',
    description: `Counts the records of a resource that a filter finds, without returning them, as JSON. Without group_by it answers { count }, or { more_than: ${exactCountLimit}, estimate } when more match. With group_by, a filterable field, it answers { group_by, groups: [{ value, count, label? }] }: the records per value, largest first, adding up to what the filter finds; a date or timestamp group_by counts per day over the last 30 days instead. filter uses the AIP-160 syntax of list_records.`,
    parameters: {
      type: 'object',
      properties: {
        resource: resourceParameter,
        filter: { type: 'string', description: 'An AIP-160 filter on filterable fields, such as status = "open" AND amount > 10.' },
        group_by: { type: 'string', description: 'A filterable field to count the records of per value, such as status.' },
        limit: { type: 'integer', minimum: 1, maximum: maxGroups, description: 'With group_by, the most groups to return, 100 by default.' },
        label: { type: 'string', description: 'With a relation group_by, a field of the linked resource to name each value by, such as name.' },
        show_deleted: { ...showDeletedParameter, description: 'true also counts soft-deleted records; only without group_by, on a resource list_resources marks soft_delete.' },
      },
      required: ['resource'],
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args, context) => {
      const resource = resourceOf(args)
      if (!resource) return 'Pass the resource as { "resource": "<name>" }.'
      const showDeleted = showDeletedOf(args)
      if (showDeleted === undefined) return invalidShowDeleted
      const filter = typeof args.filter === 'string' ? args.filter : undefined
      const groupBy = typeof args.group_by === 'string' && args.group_by ? args.group_by : undefined

      if (groupBy === undefined) {
        if (args.limit !== undefined || args.label !== undefined) return invalid(args.limit !== undefined ? 'limit' : 'label', 'Only with group_by')
        return total(context, resource, filter, showDeleted).then((counted) => JSON.stringify(counted), refused)
      }
      if (showDeleted) return invalid('show_deleted', 'Not with group_by')
      if (args.limit !== undefined && !Number.isInteger(args.limit)) return invalid('limit', 'Pass a whole number')
      if (args.label !== undefined && typeof args.label !== 'string') return invalid('label', 'Pass a field name')
      const params = {
        group_by: groupBy,
        ...(filter !== undefined && { filter }),
        ...(typeof args.limit === 'number' && { limit: args.limit }),
        ...(typeof args.label === 'string' && { label: args.label }),
      }
      return context.records.aggregate(resource, params).then((groups) => JSON.stringify(groups), refused)
    },
  })
