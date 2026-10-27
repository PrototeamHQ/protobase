import type { FieldModel, ResourceModel, ViewModel } from '@protobase/schema'
import { notFound } from '../problem'
import { everyField, listFields } from './list-fields'
import { invalidShowDeleted, keyOf, keyParameter, refused, resourceOf, resourceParameter, showDeletedOf, showDeletedParameter } from './record-tool-args'
import { countRecordsTool } from './count-records-tool'
import { defineTool, type ReadableResources, type ToolContext } from './tools'

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

/** The first line of a view's help: list_resources stays a line per resource however long the help is. */
const firstLine = (text: string) => text.split('\n', 1)[0]!.trim()

const resourceSummary = (model: ResourceModel, view: ViewModel | undefined) => ({
  name: model.name,
  ...(view?.names && { label: view.names.plural }),
  ...(view?.help && { help: firstLine(view.help) }),
  key: model.primaryKey,
  soft_delete: model.softDelete !== undefined,
})

const resourceDetail = (model: ResourceModel, view: ViewModel | undefined) => ({
  ...resourceSummary(model, view),
  ...(view?.help && { help: view.help }),
  list_fields: listFields(model, view),
  fields: Object.values(model.fields).map((field) => fieldEntry(field, view)),
})

const viewOf = ({ views }: ReadableResources, model: ResourceModel) => views.find((view) => view.resource === model.name)

/** Lists the resources the caller may read, small enough for a first call: names, labels and a line of help each, without fields. */
export const listResourcesTool = () =>
  defineTool({
    name: 'list_resources',
    description: 'Lists the resources you may read, as JSON: each with its name, label, the first line of its help, key fields and whether it soft deletes (soft_delete). describe_resource gives a resource\'s fields.',
    parameters: { type: 'object', properties: {} },
    annotations: readOnly,
    run: async (_args, context) => {
      const resources = await context.resources()
      return JSON.stringify(resources.models.map((model) => resourceSummary(model, viewOf(resources, model))))
    },
  })

/** Describes one resource the caller may read, with its fields, their labels, help and values, and which fields filters and sorts take. */
export const describeResourceTool = () =>
  defineTool({
    name: 'describe_resource',
    description: 'Describes one resource you may read, as JSON: its name, label, help, key fields, whether it soft deletes (soft_delete) and fields (name, type, label, help, enum values, the resource a relation links to, and whether it is optional, read-only, filterable and sortable), and list_fields, the fields list_records returns when not told which. Filters and order_by in list_records take only fields marked filterable or sortable.',
    parameters: { type: 'object', properties: { resource: resourceParameter }, required: ['resource'] },
    annotations: readOnly,
    run: async (args, context) => {
      const name = resourceOf(args)
      if (!name) return 'Pass the resource as { "resource": "<name>" }.'
      const resources = await context.resources()
      const model = resources.models.find((candidate) => candidate.name === name)
      if (!model) return refused(notFound(`No resource ${name} you may read; list_resources lists them.`))
      return JSON.stringify(resourceDetail(model, viewOf(resources, model)))
    },
  })

const fieldsParameter = (what: string) => ({ type: 'array', items: { type: 'string' }, minItems: 1, description: `The fields to return, such as ["id", "status"], or ["${everyField}"] for every field; ${what}.` })

/** The fields named, `*` when they ask for every field, or `undefined` when none are. */
const fieldsOf = (value: unknown) => {
  if (!Array.isArray(value) || value.length === 0 || !value.every((name): name is string => typeof name === 'string')) return undefined
  return value.includes(everyField) ? everyField : value
}

/** Without `fields`, the resource's list fields, the page naming the others in `omitted_fields`; `*` asks for all. */
const listedFields = async (resource: string, value: unknown, context: ToolContext) => {
  const named = fieldsOf(value)
  if (named === everyField) return {}
  if (named) return { fields: named }
  const readable = await context.resources()
  const model = readable.models.find((each) => each.name === resource)
  if (!model) return {}
  const fields = listFields(model, viewOf(readable, model))
  const omitted = Object.keys(model.fields).filter((name) => !fields.includes(name))
  if (omitted.length === 0) return {}
  return { fields, omitted }
}

/** Finds records of a resource with the REST API's filters, sorting and pages, under the caller's access rules. */
export const listRecordsTool = () =>
  defineTool({
    name: 'list_records',
    description: `Finds records of a resource and returns a page of them as JSON ({ items, next_page_token, total_size_estimate }). Name the fields you need in fields, such as ["id", "status"]; without it each record has its resource's list_fields, the columns of its table in the app, and the page names the others in omitted_fields: pass ["*"] for every field. filter uses AIP-160 syntax on filterable fields, such as status = "open" AND amount > 10, and order_by a comma-separated list of sortable fields, each optionally followed by desc. total_size_estimate is an estimate, not an exact count. Keep page_size small and pass next_page_token back as page_token for the next page; it is empty on the last. show_deleted: true also returns soft-deleted records.`,
    parameters: {
      type: 'object',
      properties: {
        resource: resourceParameter,
        fields: fieldsParameter('without it, the list_fields describe_resource names'),
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
      const { fields, omitted } = await listedFields(resource, args.fields, context)
      const params = {
        ...(typeof args.filter === 'string' && { filter: args.filter }),
        ...(typeof args.order_by === 'string' && { order_by: args.order_by }),
        ...(typeof args.page_token === 'string' && { page_token: args.page_token }),
        ...(fields && { fields }),
        page_size: typeof args.page_size === 'number' ? Math.min(args.page_size, maxPageSize) : defaultPageSize,
        ...(showDeleted && { show_deleted: true }),
      }
      return context.records.list(resource, params).then((page) => JSON.stringify({ ...page, ...(omitted && { omitted_fields: omitted }) }), refused)
    },
  })

/** Reads one record by its key, under the caller's access rules. */
export const getRecordTool = () =>
  defineTool({
    name: 'get_record',
    description: 'Reads one record of a resource by its key and returns it as JSON ({ record, etag }). Name the fields you need in fields, such as ["id", "status"]; without it, or with ["*"], the record has every field, long texts included. show_deleted: true also finds a soft-deleted record.',
    parameters: {
      type: 'object',
      properties: {
        resource: resourceParameter,
        key: keyParameter,
        fields: fieldsParameter('without it, every field'),
        show_deleted: showDeletedParameter,
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
      const fields = fieldsOf(args.fields)
      return context.records.get(resource, key, { show_deleted: showDeleted, ...(Array.isArray(fields) && { fields }) }).then((record) => JSON.stringify(record), refused)
    },
  })

/**
 * `list_resources`, `describe_resource`, `list_records`, `count_records` and `get_record`: reading and counting the
 * app's records as the caller, through the REST API's rules.
 */
export const readRecordTools = () => [listResourcesTool(), describeResourceTool(), listRecordsTool(), countRecordsTool(), getRecordTool()]
