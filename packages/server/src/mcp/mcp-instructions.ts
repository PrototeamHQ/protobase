/** What `mcpServer` tells a client when it connects: how to read the app's records without pulling more than it needs. */
export const mcpInstructions = [
  'Call list_resources first to find the resources, then describe_resource for one: it names the resource\'s fields, which ones filters and sorts take, and its list_fields.',
  'Name the fields you need in fields, such as ["id", "status"], on list_records and get_record: a record can hold long texts. Without fields, list_records returns the list_fields, the columns of the resource\'s table in the app, and names the others in omitted_fields; ["*"] asks for every field. get_record returns every field unless told which.',
  'Filter on fields marked filterable, the indexed ones, rather than reading pages to search them, and keep page_size small: follow next_page_token only when you need more. total_size_estimate is an estimate, not an exact count: count_records counts.',
  'For example, the open tasks, newest first, ten at a time: list_records { "resource": "tasks", "fields": ["id", "status", "title"], "filter": "status = \\"open\\"", "order_by": "created_at desc", "page_size": 10 }, then get_record { "resource": "tasks", "key": "42", "fields": ["brief"] } for one long text.',
].join('\n')
