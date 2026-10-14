import type { ImageVariant } from './files/file-options'

/** A field's storage type, as `f.*` declares it; see [Field types](website/src/content/docs/reference/data-config.mdx#field-types). */
export type FieldType =
  | 'text' | 'integer' | 'bigint' | 'decimal' | 'boolean' | 'date' | 'timestamp'
  | 'uuid' | 'enum' | 'json' | 'relation' | 'file' | 'currency' | 'country'

/**
 * A field of a resource as the server and the app see it, built from its `f.*` builder and options; see
 * [Field options](website/src/content/docs/reference/data-config.mdx#field-options).
 */
export type FieldModel = {
  /** The field's name: in URLs, the API, filters and sorts. */
  name: string
  /** The table column it reads and writes: the snake_case of the name unless `.column()` says otherwise. */
  column: string
  /** Its storage type. */
  type: FieldType
  /** Whether the value may be `null` (`.optional()`). */
  nullable: boolean
  /** Never written through the API (`.readOnly()`). */
  readOnly: boolean
  /** May appear in filters and filter widgets (`.filterable()`). */
  filterable: boolean
  /** May appear in `order_by` and sorts (`.sortable()`). */
  sortable: boolean
  /** Other names filters may use for the field (`.alias()`). */
  aliases: string[]
  /** An enum's values, in order. */
  enumValues?: string[]
  /** A relation's target. */
  relation?: {
    /** The resource it points at. */
    resource: string
    /** The columns of this table holding the other record's key, in the order of that key. */
    columns: string[]
  }
  /** Never sent with the record; revealed one value at a time (`.sensitive()`). */
  sensitive?: true
  /** A value the form prefills, or `db` when the database supplies it (identity, now(), ...). */
  default?:
    | {
        /** The value a create uses when none is given (`.default()`). */
        value: unknown
      }
    | {
        /** The database supplies the value (`.dbDefault()`). */
        db: true
      }
  /** A file field's allowed types (empty: any), largest upload in bytes, provider, and what each upload writes. */
  file?: FileFieldModel
}

/** A file field's settings, as `/meta` gives them; see [Files](website/src/content/docs/reference/files.mdx). */
export type FileFieldModel = {
  /** The content types an upload may have, exact or `type/*`; any when empty. */
  accept: string[]
  /** The largest upload, in bytes. */
  maxSize: number
  /** The name of the storage provider the files go to. */
  provider: string
  /** The fields each upload writes: those of `.derive()` and the placeholder's. */
  derive?: string[]
  /** The text field holding each image's ThumbHash, base64 (`.placeholder()`). */
  placeholder?: string
  /** The resized copies stored beside each image, by name (`.variants()`). */
  variants?: Record<string, ImageVariant>
  /** What is stored instead of an uploaded image, when the upload is not kept. */
  original?: ImageVariant
  /** Whether a value may also be an https URL of a file elsewhere, drawn and linked as it is (`.externalUrls()`). */
  external?: true
}

/** `digitsEnd`: only the end of the value's digits, spaces, `+` and dashes ignored (phone numbers). */
export type SearchMatch = 'digitsEnd'

/**
 * A resource as the server and the app see it: a table, its fields and what the API does with them, built by
 * `resource(...).toModel()`; see [resource()](website/src/content/docs/reference/data-config.mdx#resource).
 */
export type ResourceModel = {
  /** The resource's name: its address (`/api/v1/<name>`, `/<name>` in the admin) and how other config refers to it. */
  name: string
  /** The table it reads and writes. */
  table: {
    /** The table's schema; the search path decides when omitted. */
    schema?: string
    /** The table's name. */
    name: string
  }
  /** Its fields, by field name. */
  fields: Record<string, FieldModel>
  /** The fields of its key, in order; records are addressed by it. */
  primaryKey: string[]
  /** The field a delete sets instead of removing the row, and lists leave such rows out (`.softDelete()`). */
  softDelete?: string
  /** The field that separates tenants: every query is limited to the caller's tenant (`.tenant()`). */
  tenant?: string
  /** Field names that the bare-text `search` filter matches against. */
  search?: string[]
  /** How a search field matches when not by containing the word; see `SearchMatch`. */
  searchMatch?: Record<string, SearchMatch>
  /** The field holding the owning user's id; `.own` capability scopes filter on it. */
  owner?: string
  /** The events its changes raise (`.events()`), the catalogue subscriptions pick from. */
  events?: EventModel[]
}

/** What happened to a record: `delete` and `undelete` include setting and clearing a soft delete field. */
export type EventOperation = 'create' | 'update' | 'delete' | 'undelete'

/**
 * An event a resource declares. It fires for a change whose operation is listed and that passes every condition:
 * `when` on the record after the change, `from` on the record before it, `becomes` turning true (false or no record
 * before, true after), one of the `changed` fields changing, and a code predicate when `match` is set. See
 * [Declaring events](website/src/content/docs/reference/events.mdx#declaring-events).
 */
export type EventModel = {
  /** `<resource>.<name>`, such as `orders.created`. */
  name: string
  /** The operations it fires for. */
  operations: EventOperation[]
  /** A filter the record after the change must pass. */
  when?: string
  /** A filter the record before the change must pass. */
  from?: string
  /** A filter that must turn true with the change: false or no record before, true after. */
  becomes?: string
  /** Fields of which at least one must change. */
  changed?: string[]
  /** A code predicate decides too; it stays in the config. */
  match?: true
}

/** A sort: fields with their direction, the first deciding most. */
export type SortSpec = Array<[field: string, direction: 'asc' | 'desc']>

/** A value that survives `JSON.stringify` unchanged, as a custom component's props in a view must be. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/** One part of a record's key: a number for integer keys, text for the others (`bigint` included). */
export type KeyValue = string | number

/** One page of a list, as the query package reads it from the database. */
export type ListQuery = {
  /** The rows it keeps, already checked against the resource. */
  filter?: CheckedFilter
  /** The order; the primary key decides ties. */
  sort?: SortSpec
  /** The fields it reads, by name; every field when omitted. */
  columns?: string[]
  /** Where the page starts: a cursor from a previous page. */
  cursor?: string
  /** Whether the page comes after the cursor (the default) or before it. */
  direction?: 'after' | 'before'
  /** The most rows the page holds. */
  limit: number
}

/** Where a list page's filters sit on a wide screen: in a `bar` over the list, or a `panel` beside it. */
export type FilterLayout = 'bar' | 'panel'

/** Where a list's map display looks: the centre in decimal degrees, and MapLibre's zoom, from 0 to 22. */
export type MapView = {
  /** The centre's latitude, in decimal degrees. */
  latitude: number
  /** The centre's longitude, in decimal degrees. */
  longitude: number
  /** MapLibre's zoom, from 0 to 22. */
  zoom: number
}

/**
 * A place in the app: a resource's list, one of its records, its create form, or a composed page. A record's `key` is
 * its one value or its parts, as the record API takes them; `readAppPath` gives it back as the API's text form. A create
 * form's `values` fill in fields of the new record by name, as text (`{ listing_id: '42' }`). A list's `map` is where its
 * map display looks. See [Addresses](website/src/content/docs/reference/layouts.md#addresses).
 */
export type AppAddress =
  | {
      /** A resource's list. */
      kind: 'list'
      /** The resource listed. */
      resource: string
      /** An AIP-160 filter on the list. */
      filter?: string
      /** An AIP-132 order of the list. */
      orderBy?: string
      /** The display the list shows in, by name; its default when omitted. */
      display?: string
      /** Where its filters sit. */
      filterLayout?: FilterLayout
      /** Where its map display looks. */
      map?: MapView
    }
  | {
      /** One record. */
      kind: 'record'
      /** The record's resource. */
      resource: string
      /** The record's key: its value, or its parts for a composite key. */
      key: KeyValue | readonly KeyValue[]
    }
  | {
      /** The form for a new record. */
      kind: 'create'
      /** The resource the record is created in. */
      resource: string
      /** Fields of the new record filled in by name, as text; a start the person can change. */
      values?: Readonly<Record<string, string>>
    }
  | {
      /** A composed page. */
      kind: 'page'
      /** The page's name. */
      page: string
    }

/**
 * How a value is shown: `badge` as a coloured badge, `code` in monospace, `percent` with a % sign. `relative`,
 * `absolute` and `compact` are carried in `/meta` for apps that render their own lists.
 */
export type FieldFormat = 'relative' | 'absolute' | 'compact' | 'percent' | 'badge' | 'code'

/** A view's hints for one field (`.fields((r) => ...)`); see [Names and columns](website/src/content/docs/reference/ui-config.mdx#names-and-columns). */
export type FieldViewModel = {
  /** What the field is called, instead of its name in words. */
  label?: string
  /** A line under the field on the record page and in forms. */
  help?: string
  /** How the value is shown. */
  format?: FieldFormat
  /** Text before a number wherever it is shown, such as `€`. */
  prefix?: string
  /** Text after a number wherever it is shown, such as a unit: `m²` shows `120 m²`. */
  suffix?: string
  /** How many decimals a number shows. */
  decimals?: number
  /** An icon before the value on a card's meta row, by the names actions take (`ruler`); an unknown name shows none. */
  icon?: string
  /** What an enum value reads as wherever it is shown; a value without one reads as itself in words (`enumLabel`). */
  valueLabels?: Record<string, string>
  /** A hex colour per enum value that fills its badge, such as `{ a: '#00a651' }`; a value without one keeps its tone. */
  valueColors?: Record<string, string>
  /** `arrow` draws the field's badges as arrows pointing right, as on a rating scale such as the EU energy label. */
  badgeShape?: BadgeShape
  /**
   * The field type a plugin registers (`definePlugin({ fields })`) that shows and edits this field, with its props;
   * without that plugin, or for a storage type it does not show, the field shows as it would without it.
   */
  widget?: FieldWidgetModel
}

/** How a field's badges are drawn: `arrow` points them right, as on a rating scale. */
export type BadgeShape = 'arrow'

/** A field type by the name a plugin registers it under, and the plain data it is given. */
export type FieldWidgetModel = {
  /** The name the field type is registered under. */
  name: string
  /** The plain data it is given. */
  props?: Record<string, JsonValue>
}

/**
 * A way to show a list besides its table: a card per record, its content the built-in one or a component's (`card`),
 * a map of the records at their `latitude` and `longitude`, each opening the card of the cards display named `cards`
 * (`map`), or a project component (`custom`) drawing the rows the list page loads. A card's `amount` is the first of its fields with
 * a value, `footer` its fields with a value joined by bullets, and `flags` boolean fields shown as small badges of their
 * labels when true. `name` is what the address names (`?display=cards`); `label` and `icon` are its switch's. See
 * [List displays](website/src/content/docs/reference/ui-config.mdx#list-displays).
 */
export type ListDisplayModel =
  | {
      /** A card per record. */
      kind: 'cards'
      /** What the address names (`?display=cards`). */
      name: string
      /** The display's name in the switch. */
      label?: string
      /** The display's icon in the switch. */
      icon?: string
      /** A file field shown as a picture across the card's top. */
      image?: string
      /** The card's title; the view's title when omitted. */
      title?: string
      /** The line under the title. */
      subtitle?: string
      /** Fields of which the first with a value shows in bold, such as a price or a rent. */
      amount?: string[]
      /** A field drawn as a badge with its value labels. */
      badge?: string
      /** A few small fields, such as dates, each shown when it has a value. */
      meta?: string[]
      /** Fields joined by bullets on a line at the card's bottom. */
      footer?: string[]
      /** Boolean fields shown as small badges of their labels when true. */
      flags?: string[]
      /** The component that draws each card's content instead of the built-in card. */
      card?: string
      /** Where the card's further photos come from. */
      photos?: CardPhotosModel
      /** The button in the card's top right corner that saves the record to the user's own list, such as favorites. */
      favorite?: CardFavoriteModel
    }
  | {
      /** A map of the records at their position. */
      kind: 'map'
      /** What the address names (`?display=map`). */
      name: string
      /** The display's name in the switch. */
      label?: string
      /** The display's icon in the switch. */
      icon?: string
      /** The filterable number field holding each record's latitude, in decimal degrees. */
      latitude: string
      /** The filterable number field holding each record's longitude, in decimal degrees. */
      longitude: string
      /** The cards display whose card a chosen marker shows; the list's first cards display when omitted. */
      cards?: string
    }
  | {
      /** The rows drawn by a project component. */
      kind: 'custom'
      /** What the address names (`?display=board`). */
      name: string
      /** The display's name in the switch. */
      label: string
      /** The display's icon in the switch. */
      icon?: string
      /** The component's name, as `protobase.ui.tsx` registers it. */
      component: string
      /** The fields it shows, loaded with the names of the records relations point at. */
      fields: string[]
      /** The plain data the component gets, with field references where it takes a field. */
      props?: Record<string, JsonValue>
    }

/**
 * Where a card's further photos come from: the records of `resource` whose relation `field` points at the card's record,
 * in `sort` order, each shown by its file field `image`. They come with the list's records, in the same request, so
 * an index on `field` and the sorted fields serves them. See
 * [Card photos](website/src/content/docs/reference/ui-config.mdx#card-photos).
 */
export type CardPhotosModel = {
  /** The resource holding the photos. */
  resource: string
  /** Its filterable relation that points at the card's record. */
  field: string
  /** Its file field holding each photo. */
  image: string
  /** An AIP-132 order of the photos. */
  sort?: string
}

/**
 * The button in a card's top right corner that saves its record for the signed-in user: a record of `resource` whose
 * relation `field` points at the card's record, created on a press and deleted on the next. The resource has an owner,
 * so each user lists and saves their own. A visitor who is not signed in gets the resource's sign-in prompt instead
 * (`.signIn(...)` on its view). See [Favorites](website/src/content/docs/reference/ui-config.mdx#favorites).
 */
export type CardFavoriteModel = {
  /** The resource holding the saved records, such as favorites. */
  resource: string
  /** Its filterable relation that points at the card's record. */
  field: string
  /** The button's accessible name, pressed while the record is saved; "Favorite" when omitted. */
  label?: string
}

/**
 * What a visitor who is not signed in is told about a resource they could use once signed in (`.signIn(...)`): on its
 * list page, in place of the list, and in the dialog of a card's favorite button or a list's "Save search" button
 * that saves to it. See
 * [Sign-in prompts](website/src/content/docs/reference/ui-config.mdx#sign-in-prompts).
 */
export type SignInPromptModel = {
  /** The heading, such as "Keep the homes you like". */
  title: string
  /** A line under it, saying what signing in gives. */
  description: string
  /** What the visitor can do once signed in, one short line each. */
  benefits?: string[]
  /** The prompt's icon, a name `icon` hints take; a sign-in icon when omitted. */
  icon?: string
  /**
   * A page elsewhere where a visitor makes an account, `https:`, `http:` or `mailto:`, offered beside "Sign in". When
   * omitted, the app's own sign-up is offered if the server has open sign-up, and none otherwise.
   */
  signUp?: {
    /** The button's text, such as "Create an account". */
    label: string
    /** The page's address. */
    href: string
  }
}

/** A resource a visitor cannot open until they sign in, as `/meta` names it: what its view calls it and its prompt. */
export type SignInViewModel = Pick<ViewModel, 'resource' | 'names' | 'nav'> & {
  /** What the visitor is told. */
  signIn: SignInPromptModel
}

/**
 * The "Save search" button of a list page: it saves the list's filter as a record of `resource`, the signed-in user's
 * own, whose view lists them (`.searchesOf(...)`). A visitor who is not signed in gets the resource's sign-in prompt
 * instead. See [Saved searches](website/src/content/docs/reference/ui-config.mdx#saved-searches).
 */
export type SaveSearchModel = {
  /** The resource holding the saved searches, whose view has `searchesOf` for this one. */
  resource: string
  /** The button's text, pressed while the filter is saved; "Save search" when omitted. */
  label?: string
}

/**
 * What a saved search is (`.searchesOf(...)`): the list page shows each of the user's searches, with its filters, its
 * `controls`, and the first records of `resource` it finds, newest first, and a link to all of them. See
 * [Saved searches](website/src/content/docs/reference/ui-config.mdx#saved-searches).
 */
export type SearchesOfModel = {
  /** The resource searched, such as listings. */
  resource: string
  /** The text field holding the search's filter, as the list's address has it. */
  filter: string
  /** The text field a new search is named in, from its filters; the view's title shows it. */
  name?: string
  /** Enum and boolean fields changed in place on each search, such as how often to hear of new records. */
  controls?: string[]
  /**
   * With it, each search shows only the records new to the user: those whose `field` (of `resource`) is after the
   * search's `seenAt` (a timestamp field of this resource), which opening all of its results sets to now.
   */
  unseen?: {
    /** When the user last opened the search's results. */
    seenAt: string
    /** The searched resource's timestamp that makes a record new, such as when it was published. */
    field: string
  }
  /** How many records each search shows; default 12. */
  limit?: number
}

/** A view's list page (`.list(...)`). */
export type ListModel = {
  /** The table's columns, in order. */
  columns: string[]
  /** The order the list starts in. */
  sort?: SortSpec
  /** Defaults for the UI's search box. `ResourceModel.search` is authoritative for what `search(...)` matches on the server. */
  search?: string[]
  /** Other ways to show the list besides its table, in the order the switch shows them after it. */
  displays?: ListDisplayModel[]
  /** The display the list opens in when the address names none; the table when omitted. */
  default?: string
}

/** A button of a date range filter: today, yesterday, the last 7, 30 or 90 days, or this month, quarter or year. */
export type DatePreset = 'today' | 'yesterday' | '7d' | '30d' | '90d' | 'month' | 'quarter' | 'year'

/**
 * A filter widget above a list (`.filters((r, w) => ...)`), on a filterable field; see
 * [Filters and the chart](website/src/content/docs/reference/ui-config.mdx#filters-and-the-chart).
 */
export type FilterWidgetModel =
  | {
      /** A slider between the lowest and highest value. */
      kind: 'range'
      /** The field it filters. */
      field: string
      /** Whether the values' histogram is drawn behind the slider. */
      histogram: boolean
    }
  | {
      /** A menu of the field's values with counts. */
      kind: 'facets'
      /** The field it filters. */
      field: string
      /** Whether the menu has a search box, for long lists. */
      search: boolean
    }
  | {
      /** Buttons for date ranges. */
      kind: 'dateRange'
      /** The date or timestamp field it filters. */
      field: string
      /** The buttons it shows. */
      presets: DatePreset[]
    }
  | {
      /** A switch for a boolean field. */
      kind: 'toggle'
      /** The boolean field it filters. */
      field: string
    }
  | {
      /** A menu of boolean fields under one label; a record shows when any chosen field is true. */
      kind: 'flags'
      /** The boolean fields it offers. */
      fields: string[]
      /** The menu's label. */
      label: string
    }

/**
 * Records of another resource on the record page: those whose `field` holds this record's key or, with `through`,
 * those whose `field` holds one of the `key` values of the `through` records that point at this record (a join table).
 * See [Related records](website/src/content/docs/reference/ui-config.mdx#related-records).
 */
export type RelatedModel = {
  /** A related records section. */
  kind: 'related'
  /** The section's title. */
  title: string
  /** A line under the title. */
  help?: string
  /** The resource whose records it lists. */
  resource: string
  /** The filterable field of `resource` matched against this record's key, or with `through` against the join records' keys. */
  field: string
  /** The join records between this record and the listed ones. */
  through?: {
    /** The join resource. */
    resource: string
    /** Its filterable relation that holds this record's key. */
    field: string
    /** Its field whose values pick the listed records; its primary key when omitted. */
    key?: string
    /** An AIP-160 filter on the join records. */
    filter?: string
  }
  /** An AIP-160 filter on the listed records. */
  filter?: string
  /** An AIP-132 order of the listed records. */
  sort?: string
  /** Fields of `resource`, through relations too (`unitId.propertyId`). */
  columns?: string[]
  /** How many records it shows, the first in `sort` order; "View all" opens the rest in the list. */
  limit?: number
  /** The display of `resource`'s list it opens in, such as `cards`; the list's default when omitted. */
  display?: string
  /** The text when nothing matches. */
  empty?: string
}

/**
 * A project component drawn on the record page where it is listed, in the main column or with `sidebar` in the
 * sidebar, under `title` when it has one. It gets `props` and reads the record with `useLayoutRecord()`.
 */
export type CustomSectionModel = {
  /** A custom section. */
  kind: 'custom'
  /** The component's name, as `protobase.ui.tsx` registers it. */
  component: string
  /** The title over it. */
  title?: string
  /** The plain data the component gets, with field references where it takes a field. */
  props?: Record<string, JsonValue>
  /** Drawn as a sidebar card instead of in the main column. */
  sidebar?: true
}

/**
 * A map of the record's position, its `latitude` and `longitude` fields in decimal degrees (WGS84), centred on a marker
 * at `zoom`: in the main column under `title`, or with `sidebar` as a sidebar card. The app draws it with the map style
 * its server names, and leaves it out without one. See [Maps](website/src/content/docs/reference/ui-config.mdx#maps).
 */
export type MapSectionModel = {
  /** A map section. */
  kind: 'map'
  /** The section's title. */
  title: string
  /** The number field holding the record's latitude. */
  latitude: string
  /** The number field holding the record's longitude. */
  longitude: string
  /** MapLibre's zoom, from 0 to 22; 15 when omitted. */
  zoom?: number
  /** Drawn as a sidebar card instead of in the main column. */
  sidebar?: true
}

/** An item of the record page (`.layout((r) => ...)` with `l`); see [The record page](website/src/content/docs/reference/ui-config.mdx#the-record-page). */
export type LayoutItemModel =
  | {
      /** A titled group of fields in the main column, editable where the user may write. */
      kind: 'section'
      /** The section's title. */
      title: string
      /** The fields it shows, in order. */
      fields: string[]
      /** A line under the title. */
      help?: string
    }
  | {
      /** A read-only summary card beside the main column. */
      kind: 'sidebar'
      /** The fields it shows, in order. */
      fields: string[]
    }
  | RelatedModel
  | CustomSectionModel
  | MapSectionModel

/** How far back a list's chart reaches. */
export type ChartRange = '7d' | '30d' | '90d' | '1y' | 'all'
/** How long each bar of a list's chart is. */
export type ChartGranularity = 'hour' | 'day' | 'week' | 'month'

/** A chart of records over time above a list, following its filters (`.chart(...)`). */
export type ChartModel = {
  /** The date or timestamp field the records are counted by. */
  field: string
  /** How far back it reaches. */
  range: ChartRange
  /** How long each bar is. */
  granularity: ChartGranularity
}

/** How the record page shows that a save went through: a `toast` (the default) or on the Save `button`. */
export type SaveFeedback = 'toast' | 'button'

/**
 * What a named action does in the app: set fields of the record (`update`), delete it (`delete`), go to an address in
 * the app (`link` with `to`) or open a link that leaves it (`link` with `href`), `{field}` replaced by the record's
 * values. Without it the app runs a handler it registered by name.
 */
export type ActionRun =
  | {
      /** Updates the record. */
      kind: 'update'
      /** The fields it sets, by name. */
      values: Record<string, unknown>
    }
  | {
      /** Deletes the record, soft deleting when the resource does. */
      kind: 'delete'
    }
  | {
      /** Goes to an address in the app. */
      kind: 'link'
      /** The address, with `{field}` replaced by the record's values. */
      to: AppAddress
    }
  | {
      /** Opens a link that leaves the app, an `https:` or `http:` one in a new tab without the referrer. */
      kind: 'link'
      /**
       * The link (`https:`, `mailto:`), with `{field}` replaced by the record's values, percent-encoded; or only `{field}`,
       * the `https:` or `http:` URL the record holds, without which the action does not show.
       */
      href: string
    }

/** A named action of a view (`.actions((a) => ...)`); see [Named actions](website/src/content/docs/reference/layouts.md#named-actions). */
export type ActionModel = {
  /** The action's name, which `<Action name="..." />` and handlers use. */
  name: string
  /** The button's label. */
  label: string
  /** The button's icon: `bed`, `bell`, `bookmark`, `external-link`, `file-text`, `heart`, `ruler`, `send` or `wallet`; another name shows a lightning bolt. */
  icon?: string
  /** The question the button asks before it runs the action. */
  confirm?: string
  /** Whether the action is meant for several records at once (`a.action`'s `bulk`). */
  bulk: boolean
  /** What it does; without it the app runs the handler registered under `name`. */
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

/** Where a resource sits in the sidebar (`.nav(...)`); see [Sidebar](website/src/content/docs/reference/sidebar.md). */
export type NavModel = {
  /** Hide the resource from the sidebar, for line or link tables. */
  hidden?: boolean
  /** The sidebar group it sits in; its database schema when omitted. */
  group?: string
  /** Where it sorts within its group. */
  order?: number
  /** A few of its records listed under its entry. */
  recent?: NavRecentModel
}

/** An entry in the menu under the signed-in user, at the bottom of the sidebar. */
export type UserMenuItemModel =
  | {
      /** Opens a resource's list. */
      kind: 'resource'
      /** The resource, which leaves the sidebar. */
      resource: string
      /** The entry's label; the view's plural name when omitted. */
      label?: string
      /** The entry's icon; the resource's sidebar icon when omitted. */
      icon?: string
    }
  | {
      /** Opens a composed page. */
      kind: 'page'
      /** The page, which leaves the sidebar. */
      page: string
      /** The entry's label; the page's title when omitted. */
      label?: string
      /** The entry's icon. */
      icon?: string
    }
  | {
      /** Opens an address outside the admin in a new tab. */
      kind: 'link'
      /** The entry's label. */
      label: string
      /** The address: `https:`, `http:` or `mailto:`. */
      href: string
      /** The entry's icon; `external-link` when omitted. */
      icon?: string
    }

/** The menu under the signed-in user (`userMenu(...)`); see [User menu](website/src/content/docs/reference/user-menu.md). */
export type UserMenuModel = {
  /** Its entries, in order, before the built-in account pages and "Sign out". */
  items: UserMenuItemModel[]
}

/** A tab of a bottom bar on phones: icon above an explicit label. */
export type BottomBarItemModel =
  | {
      /** Opens a resource's list. */
      kind: 'resource'
      /** The resource. */
      resource: string
      /** The tab's label. */
      label: string
      /** The tab's icon; the resource's sidebar icon when omitted. */
      icon?: string
    }
  | {
      /** Opens a composed page. */
      kind: 'page'
      /** The page. */
      page: string
      /** The tab's label. */
      label: string
      /** The tab's icon; the page's own when omitted. */
      icon?: string
    }
  | {
      /** Opens an address outside the admin in a new tab. */
      kind: 'link'
      /** The tab's label. */
      label: string
      /** The address: `https:`, `http:` or `mailto:`. */
      href: string
      /** The tab's icon. */
      icon?: string
    }

/**
 * A bottom bar for the users holding one of `roles`; `label` names it in the role view switcher. See
 * [Bottom bar](website/src/content/docs/reference/bottom-bar.md).
 */
export type BottomBarModel = {
  /** The bar's name, where someone with several switches between them. */
  label: string
  /** The roles that get the bar; a role belongs to one bar. */
  roles: string[]
  /** Its tabs, in order, at most four before "More". */
  items: BottomBarItemModel[]
}

/**
 * The title replaces `title` in search results; `subtitle` is the second line unless the search matched another search
 * field, which then shows instead. Without a subtitle, the first search field not in the title is the default.
 */
export type SearchResultModel = {
  /** Fields joined by spaces into the result's bold line; the view's `title` when omitted. */
  title?: string[]
  /** The field on the line under it. */
  subtitle?: string
}

/**
 * How the admin shows a resource: its names, list, filters, record page and actions, built by `view(...)` and sent to
 * each user in `/meta` without what they cannot see. See [Views](website/src/content/docs/reference/ui-config.mdx).
 */
export type ViewModel = {
  /** The resource it shows. */
  resource: string
  /** Shown only to users with one of these roles; a view without roles is the default. */
  roles?: string[]
  /** Field used as the record's display title in breadcrumbs, relation links and search results. */
  title?: string
  /** A record in the global search: a title of one or more fields joined by spaces, over a subtitle field by default. */
  searchResult?: SearchResultModel
  /** Where the resource sits in the sidebar. */
  nav?: NavModel
  /** What one record and several are called, such as "Repair" and "Repairs"; the resource's name in words when omitted. */
  names?: {
    /** One record's name, as in "New repair". */
    singular: string
    /** The records' name, as in the sidebar. */
    plural: string
  }
  /** An icon name, carried in `/meta` for apps that render their own shell. */
  icon?: string
  /** A line under the list's title. */
  help?: string
  /** Hints per field, by field name. */
  fields: Record<string, FieldViewModel>
  /** The list page; the resource's first six fields as columns when omitted. */
  list?: ListModel
  /** The filter widgets above the list, in order. */
  filters: FilterWidgetModel[]
  /** The record page's items, in order; one section of every field when empty. */
  layout: LayoutItemModel[]
  /** A chart of records over time above the list. */
  chart?: ChartModel
  /** How the record page shows that a save went through. */
  saveFeedback?: SaveFeedback
  /** The named actions of its records. */
  actions: ActionModel[]
  /** The relation field whose records the list page shows instead of this resource's rows, in their own view's list. */
  listOf?: string
  /** What a visitor who is not signed in is told in place of the list, and by a favorite or "Save search" button that saves here. */
  signIn?: SignInPromptModel
  /** The list page's button that saves its filter as a search of the user's own. */
  saveSearch?: SaveSearchModel
  /** The list page shows the user's saved searches of another resource, each with what it finds, instead of rows. */
  searchesOf?: SearchesOfModel
}

/** Where a part of a filter or order stands in its text, as character offsets. */
export type Span = {
  /** The offset of its first character. */
  start: number
  /** The offset after its last character. */
  end: number
}

/** A field named in a filter or order, as written: its name, or a path through relations (`customer.name`). */
export type FieldPath = {
  /** A field path. */
  kind: 'field'
  /** The names along the path, the field's own last. */
  path: string[]
  /** Where it stands in the text. */
  span: Span
}

/** The unit of a duration: seconds, minutes, hours, days or weeks. */
export type DurationUnit = 's' | 'm' | 'h' | 'd' | 'w'

/** A length of time in a filter, such as `7d`. */
export type DurationLiteral = {
  /** A duration. */
  kind: 'duration'
  /** How many units. */
  amount: number
  /** The unit. */
  unit: DurationUnit
  /** Where it stands in the filter text. */
  span: Span
}

/** A value written in a filter: text, a number, `true` or `false`, a duration or a timestamp. */
export type Literal =
  | {
      /** Quoted text. */
      kind: 'string'
      /** The text, unescaped. */
      value: string
      /** Where it stands in the filter text. */
      span: Span
    }
  | {
      /** A number. */
      kind: 'number'
      /** The number. */
      value: number
      /** The number as written, which keeps digits a `number` cannot hold, as for `bigint` and `decimal` fields. */
      raw: string
      /** Where it stands in the filter text. */
      span: Span
    }
  | {
      /** `true` or `false`. */
      kind: 'boolean'
      /** The value. */
      value: boolean
      /** Where it stands in the filter text. */
      span: Span
    }
  | DurationLiteral
  | {
      /** An RFC 3339 timestamp. */
      kind: 'timestamp'
      /** The timestamp as written. */
      value: string
      /** Where it stands in the filter text. */
      span: Span
    }

/** `now()` in a filter, the moment the filter runs, with an optional offset such as `now() - 7d`. */
export type NowValue = {
  /** The current time. */
  kind: 'now'
  /** A duration added or taken off. */
  offset?: {
    /** Whether the duration is added or taken off. */
    sign: '+' | '-'
    /** The duration. */
    duration: DurationLiteral
  }
  /** Where it stands in the filter text. */
  span: Span
}

/** What a field is compared with in a filter: a written value or `now()`. */
export type FilterValue = Literal | NowValue

/** A comparison in a filter. */
export type CompareOp = '=' | '!=' | '<' | '<=' | '>' | '>='

/**
 * A filter's syntax tree: AIP-160 with the functions the API adds (`search`, `similar`, `regex`, `isNull`, `in`); see
 * [Filters](website/src/content/docs/reference/api.md#filters). `F` is how a field is represented: a `FieldPath` when
 * parsed (`FilterExpr`), a `FieldModel` once checked (`CheckedFilter`).
 */
export type FilterOf<F> =
  | {
      /** Every one of `args` holds (`AND`). */
      kind: 'and'
      /** The filters joined. */
      args: FilterOf<F>[]
      /** Where it stands in the filter text. */
      span: Span
    }
  | {
      /** One of `args` holds (`OR`). */
      kind: 'or'
      /** The filters joined. */
      args: FilterOf<F>[]
      /** Where it stands in the filter text. */
      span: Span
    }
  | {
      /** `arg` does not hold (`NOT`, `-`). */
      kind: 'not'
      /** The filter negated. */
      arg: FilterOf<F>
      /** Where it stands in the filter text. */
      span: Span
    }
  | {
      /** A comparison of a field with a value. */
      kind: 'compare'
      /** The comparison. */
      op: CompareOp
      /** The field compared. */
      field: F
      /** What it is compared with. */
      value: FilterValue
      /** Where it stands in the filter text. */
      span: Span
    }
  | {
      /** `field:value`: a JSON field holds the value as a key or element. */
      kind: 'has'
      /** The field. */
      field: F
      /** The value it holds. */
      value: Literal
      /** Where it stands in the filter text. */
      span: Span
    }
  | {
      /** `field:*`: the field has a value. */
      kind: 'present'
      /** The field. */
      field: F
      /** Where it stands in the filter text. */
      span: Span
    }
  | {
      /** `in(field, v, ...)`: the field equals one of the values. */
      kind: 'in'
      /** The field. */
      field: F
      /** The values. */
      values: Literal[]
      /** Where it stands in the filter text. */
      span: Span
    }
  | {
      /** `search("text")` or bare words: every word appears in one of the resource's search fields. */
      kind: 'search'
      /** The text searched for. */
      text: string
      /** Where it stands in the filter text. */
      span: Span
    }
  | {
      /** `similar(field, "text")`: the field is like the text, by pg_trgm similarity. */
      kind: 'similar'
      /** The field. */
      field: F
      /** The text it is compared with. */
      text: string
      /** Where it stands in the filter text. */
      span: Span
    }
  | {
      /** `regex(field, "pattern")`: the field matches the regular expression. */
      kind: 'regex'
      /** The field. */
      field: F
      /** The regular expression. */
      pattern: string
      /** Where it stands in the filter text. */
      span: Span
    }
  | {
      /** `isNull(field)`: the field has no value. */
      kind: 'isNull'
      /** The field. */
      field: F
      /** Where it stands in the filter text. */
      span: Span
    }

/** A filter as parsed, its fields as written (`parseFilter`). */
export type FilterExpr = FilterOf<FieldPath>

/** A filter checked against a resource, its fields resolved to the resource's (`checkFilter`). */
export type CheckedFilter = FilterOf<FieldModel>

/** Why a filter or order could not be parsed or checked, as `FilterError.code` names it. */
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

/** A problem with a filter or order, where it is and how to fix it. */
export type FilterError = {
  /** What kind of problem it is. */
  code: FilterErrorCode
  /** What is wrong. */
  message: string
  /** How to fix it. */
  hint: string
  /** Where it stands in the text. */
  span: Span
}

/** One field of an AIP-132 order, as parsed (`parseOrderBy`). */
export type OrderByItem = {
  /** The field, as written. */
  path: FieldPath
  /** Its direction. */
  direction: 'asc' | 'desc'
  /** Where it stands in the order text. */
  span: Span
}
