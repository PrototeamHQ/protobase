import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { invalidShowDeleted, keyOf, keyParameter, refused, resourceOf, resourceParameter, showDeletedOf, showDeletedParameter } from './record-tool-args'
import type { ListParams, ToolRecord } from './records'
import { budgetedPage, cutRecordNote } from './budgeted-page'
import { fieldPiece, pieceParameters, readsPiece } from './record-field-piece'
import { forcedJson } from './result-budget'
import { defineTool, type ReadableResources } from './tools'

const readOnly = { readOnlyHint: true, openWorldHint: false }
const defaultPageSize = 20
const maxPageSize = 100

const fieldEntry = (field: FieldModel, view: ViewModel | undefined) => {
  const hint = view?.fields[field.name]
  return {
    name: field.name,
    type: field.type,
    ...(hint?.label && { label: hint.label }),
    ...(hint?.help && { help: hint.help }),
    ...(field.enumValues && { values: field.enumValues }),
    ...(field.relation && { links_to: field.relation.resource }),
    optional: field.nullable,
    read_only: field.readOnly,
    filterable: field.filterable,
    sortable: field.sortable,
  }
}

const resourceEntry = (model: ResourceModel, view: ViewModel | undefined) => ({
  name: model.name,
  ...(view?.names && { label: view.names.plural }),
  ...(view?.help && { help: view.help }),
  key: model.primaryKey,
  soft_delete: model.softDelete !== undefined,
  fields: Object.values(model.fields).map((field) => fieldEntry(field, view)),
})

const described = ({ models, views }: ReadableResources) => models.map((model) => resourceEntry(model, views.find((view) => view.resource === model.name)))

/** Lists the resources the caller may read, with their fields, labels and which fields filters and sorts take. */
export const listResourcesTool = () =>
  defineTool({
    name: 'list_resources',
    description: 'Lists the resources you may read, as JSON: each with its name, label, key fields, whether it soft deletes (soft_delete) and fields (name, type, label, enum values, the resource a relation links to, and whether it is optional, read-only, filterable and sortable). Filters and order_by in list_records take only fields marked filterable or sortable.',
    parameters: { type: 'object', properties: {} },
    annotations: readOnly,
    run: async (_args, context) => JSON.stringify(described(await context.resources())),
  })

/** Finds records of a resource with the REST API's filters, sorting and pages, under the caller's access rules. */
export const listRecordsTool = () =>
  defineTool({
    name: 'list_records',
    description: `Finds records of a resource and returns a page of them as JSON ({ items, next_page_token, total_size_estimate }). filter uses AIP-160 syntax, such as status = "open" AND amount > 10, and order_by a comma-separated list of fields, each optionally followed by desc. Pass next_page_token back as page_token for the next page; it is empty on the last. A page too large for one result holds fewer records, with long values cut and named in cut_fields, and a note on reading the rest. show_deleted: true also returns soft-deleted records.`,
    parameters: {
      type: 'object',
      properties: {
        resource: resourceParameter,
        filter: { type: 'string', description: 'An AIP-160 filter on filterable fields, such as status = "open" AND amount > 10.' },
        order_by: { type: 'string', description: 'Sortable fields, comma-separated, each optionally followed by desc, such as created_at desc.' },
        page_size: { type: 'integer', minimum: 1, maximum: maxPageSize, description: `Records per page, ${defaultPageSize} by default.` },
        page_token: { type: 'string', description: 'The next_page_token of the previous page.' },
        show_deleted: showDeletedParameter,
      },
      required: ['resource'],
    },
    annotations: readOnly,
    run: async (args, context) => {
      const resource = resourceOf(args)
      if (!resource) return 'Pass the resource as { "resource": "<name>" }.'
      const showDeleted = showDeletedOf(args)
      if (showDeleted === undefined) return invalidShowDeleted
      const params = {
        ...(typeof args.filter === 'string' && { filter: args.filter }),
        ...(typeof args.order_by === 'string' && { order_by: args.order_by }),
        ...(typeof args.page_token === 'string' && { page_token: args.page_token }),
        page_size: typeof args.page_size === 'number' ? Math.min(args.page_size, maxPageSize) : defaultPageSize,
        ...(showDeleted && { show_deleted: true }),
      }
      const list = (paged: ListParams) => context.records.list(resource, paged)
      return list(params).then((page) => budgetedPage(page, params, list)).catch(refused)
    },
  })

/** Reads one record by its key, under the caller's access rules. */
export const getRecordTool = () =>
  defineTool({
    name: 'get_record',
    description: 'Reads one record of a resource by its key and returns it as JSON ({ record, etag }), with long values cut and named in cut_fields when it is too large for one result. field reads one field alone, in pieces from offset. show_deleted: true also finds a soft-deleted record.',
    parameters: {
      type: 'object',
      properties: {
        resource: resourceParameter,
        key: keyParameter,
        show_deleted: showDeletedParameter,
        ...pieceParameters,
      },
      required: ['resource', 'key'],
    },
    annotations: readOnly,
    run: async (args, context) => {
      const resource = resourceOf(args)
      const key = keyOf(args.key)
      if (!resource || key === undefined) return 'Pass the resource and key as { "resource": "<name>", "key": "<key>" }.'
      const showDeleted = showDeletedOf(args)
      if (showDeleted === undefined) return invalidShowDeleted
      const shown = (found: ToolRecord) => (readsPiece(args) ? fieldPiece(found, args) : forcedJson(found, cutRecordNote))
      return context.records.get(resource, key, { show_deleted: showDeleted }).then(shown, refused)
    },
  })

/** `list_resources`, `list_records` and `get_record`: reading the app's records as the caller, through the REST API's rules. */
export const readRecordTools = () => [listResourcesTool(), listRecordsTool(), getRecordTool()]
