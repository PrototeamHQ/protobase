export type FieldType =
  | 'text' | 'integer' | 'bigint' | 'decimal' | 'boolean' | 'date' | 'timestamp'
  | 'uuid' | 'enum' | 'json' | 'relation' | 'file' | 'currency' | 'country'

export type FieldModel = {
  name: string
  column: string
  type: FieldType
  nullable: boolean
  readOnly: boolean
  filterable: boolean
  sortable: boolean
  aliases: string[]
  enumValues?: string[]
  relation?: { resource: string; columns: string[] }
  /** Never sent with the record; revealed one value at a time (`.sensitive()`). */
  sensitive?: true
  /** A value the form prefills, or `db` when the database supplies it (identity, now(), ...). */
  default?: { value: unknown } | { db: true }
  /** A file field's allowed types (empty: any), largest upload in bytes, provider, and the fields `.derive()` writes. */
  file?: FileFieldModel
}

export type FileFieldModel = { accept: string[]; maxSize: number; provider: string; derive?: string[] }

/** `digitsEnd`: only the end of the value's digits, spaces, `+` and dashes ignored (phone numbers). */
export type SearchMatch = 'digitsEnd'

export type ResourceModel = {
  name: string
  table: { schema?: string; name: string }
  fields: Record<string, FieldModel>
  primaryKey: string[]
  softDelete?: string
  tenant?: string
  /** Field names that the bare-text `search` filter matches against. */
  search?: string[]
  /** How a search field matches when not by containing the word; see `SearchMatch`. */
  searchMatch?: Record<string, SearchMatch>
  /** The field holding the owning user's id; `.own` capability scopes filter on it. */
  owner?: string
}

export type SortSpec = Array<[field: string, direction: 'asc' | 'desc']>

export type KeyValue = string | number

export type ListQuery = {
  filter?: CheckedFilter
  sort?: SortSpec
  columns?: string[]
  cursor?: string
  direction?: 'after' | 'before'
  limit: number
}

export type FieldFormat = 'relative' | 'absolute' | 'compact' | 'percent' | 'badge' | 'code'

export type FieldViewModel = {
  label?: string
  help?: string
  format?: FieldFormat
  prefix?: string
  decimals?: number
  /** What an enum value reads as wherever it is shown; a value without one reads as itself in words (`enumLabel`). */
  valueLabels?: Record<string, string>
}

export type ListModel = {
  columns: string[]
  sort?: SortSpec
  /** Defaults for the UI's search box. `ResourceModel.search` is authoritative for what `search(...)` matches on the server. */
  search?: string[]
}

export type DatePreset = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'month' | 'quarter' | 'year'

export type FilterWidgetModel =
  | { kind: 'range'; field: string; histogram: boolean }
  | { kind: 'facets'; field: string; search: boolean }
  | { kind: 'dateRange'; field: string; presets: DatePreset[] }
  | { kind: 'toggle'; field: string }

/**
 * Records of another resource on the record page: those whose `field` holds this record's key or, with `through`,
 * those whose `field` holds one of the `key` values of the `through` records that point at this record (a join table).
 */
export type RelatedModel = {
  kind: 'related'
  title: string
  help?: string
  resource: string
  field: string
  through?: { resource: string; field: string; key?: string; filter?: string }
  filter?: string
  sort?: string
  /** Fields of `resource`, through relations too (`unitId.propertyId`). */
  columns?: string[]
  pageSize?: number
  empty?: string
}

export type LayoutItemModel =
  | { kind: 'section'; title: string; fields: string[]; help?: string }
  | { kind: 'sidebar'; fields: string[] }
  | RelatedModel

export type ChartRange = '7d' | '30d' | '90d' | '1y' | 'all'
export type ChartGranularity = 'hour' | 'day' | 'week' | 'month'

export type ChartModel = {
  field: string
  range: ChartRange
  granularity: ChartGranularity
}

export type SaveFeedback = 'toast' | 'button'

/**
 * What a named action does in the app: set fields of the record (`update`), delete it (`delete`) or open a link
 * (`link`, with `{field}` replaced by the record's values). Without it the app runs a handler it registered by name.
 */
export type ActionRun =
  | { kind: 'update'; values: Record<string, unknown> }
  | { kind: 'delete' }
  | { kind: 'link'; href: string }

export type ActionModel = {
  name: string
  label: string
  icon?: string
  confirm?: string
  bulk: boolean
  run?: ActionRun
}

/** The colour of a status dot in the sidebar. */
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

/** A collapsible list of a few records under the resource's sidebar entry, each with a status dot. */
export type NavRecentModel = {
  /** The field whose value picks each record's dot. */
  status: string
  /** Dot colour per status value; values not listed are `neutral`. */
  tones: Record<string, StatusTone>
  /** Status values whose dot pulses, for states that are in progress. */
  pulse?: string[]
  /** AIP-160 filter choosing the records that qualify, as the list API takes it. */
  filter?: string
  /** AIP-132 order; the list's sort when omitted. */
  orderBy?: string
  /** How many records to show, 1 to 20; 3 when omitted. */
  limit?: number
}

export type NavModel = {
  /** Hide the resource from the sidebar, for line or link tables. */
  hidden?: boolean
  group?: string
  order?: number
  recent?: NavRecentModel
}

/** An entry in the menu under the signed-in user, at the bottom of the sidebar. */
export type UserMenuItemModel =
  | { kind: 'resource'; resource: string; label?: string; icon?: string }
  | { kind: 'page'; page: string; label?: string; icon?: string }
  | { kind: 'link'; label: string; href: string; icon?: string }

export type UserMenuModel = { items: UserMenuItemModel[] }

/**
 * The title replaces `title` in search results; `subtitle` is the second line unless the search matched another search
 * field, which then shows instead. Without a subtitle, the first search field not in the title is the default.
 */
export type SearchResultModel = { title?: string[]; subtitle?: string }

export type ViewModel = {
  resource: string
  /** Shown only to users with one of these roles; a view without roles is the default. */
  roles?: string[]
  /** Field used as the record's display title in breadcrumbs, relation links and search results. */
  title?: string
  /** A record in the global search: a title of one or more fields joined by spaces, over a subtitle field by default. */
  searchResult?: SearchResultModel
  nav?: NavModel
  names?: { singular: string; plural: string }
  icon?: string
  help?: string
  fields: Record<string, FieldViewModel>
  list?: ListModel
  filters: FilterWidgetModel[]
  layout: LayoutItemModel[]
  chart?: ChartModel
  saveFeedback?: SaveFeedback
  actions: ActionModel[]
}

export type Span = { start: number; end: number }

export type FieldPath = { kind: 'field'; path: string[]; span: Span }

export type DurationUnit = 's' | 'm' | 'h' | 'd' | 'w'

export type DurationLiteral = { kind: 'duration'; amount: number; unit: DurationUnit; span: Span }

export type Literal =
  | { kind: 'string'; value: string; span: Span }
  | { kind: 'number'; value: number; raw: string; span: Span }
  | { kind: 'boolean'; value: boolean; span: Span }
  | DurationLiteral
  | { kind: 'timestamp'; value: string; span: Span }

export type NowValue = {
  kind: 'now'
  offset?: { sign: '+' | '-'; duration: DurationLiteral }
  span: Span
}

export type FilterValue = Literal | NowValue

export type CompareOp = '=' | '!=' | '<' | '<=' | '>' | '>='

// F is how a field is represented: a FieldPath when parsed, a FieldModel once checked.
export type FilterOf<F> =
  | { kind: 'and'; args: FilterOf<F>[]; span: Span }
  | { kind: 'or'; args: FilterOf<F>[]; span: Span }
  | { kind: 'not'; arg: FilterOf<F>; span: Span }
  | { kind: 'compare'; op: CompareOp; field: F; value: FilterValue; span: Span }
  | { kind: 'has'; field: F; value: Literal; span: Span }
  | { kind: 'present'; field: F; span: Span }
  | { kind: 'in'; field: F; values: Literal[]; span: Span }
  | { kind: 'search'; text: string; span: Span }
  | { kind: 'similar'; field: F; text: string; span: Span }
  | { kind: 'regex'; field: F; pattern: string; span: Span }
  | { kind: 'isNull'; field: F; span: Span }

export type FilterExpr = FilterOf<FieldPath>

export type CheckedFilter = FilterOf<FieldModel>

export type FilterErrorCode =
  | 'unexpected-character'
  | 'unterminated-string'
  | 'invalid-escape'
  | 'invalid-number'
  | 'invalid-timestamp'
  | 'unexpected-token'
  | 'expected-token'
  | 'unknown-function'
  | 'invalid-arguments'
  | 'unsupported'
  | 'too-deep'
  | 'unknown-field'
  | 'not-filterable'
  | 'not-sortable'
  | 'unsupported-traversal'
  | 'invalid-value'
  | 'operator-not-allowed'
  | 'wildcard-not-allowed'
  | 'invalid-unicode'
  | 'too-long'
  | 'invalid-traversal'
  | 'wrong-arity'
  | 'wrong-argument'
  | 'not-boolean'
  | 'expected-field'
  | 'no-search-fields'

export type FilterError = { code: FilterErrorCode; message: string; hint: string; span: Span }

export type OrderByItem = { path: FieldPath; direction: 'asc' | 'desc'; span: Span }
