import { fieldRefsIn, markFieldRefs } from './field-ref'
import type { CardFavoriteModel, CardPhotosModel, JsonValue, ListDisplayModel, RelatedColumnModel, ResourceModel } from './model'
import type { Ref } from './refs'
import type { ListColumn } from './view-columns'

/** A custom component as `component(name)` from `@protobase/layout` declares it. */
export type ComponentRef<P> = ((props: P) => unknown) & {
  /** The name it is registered under. */
  readonly blockName: string
  /** Whether it is the project's or a plugin's, rather than a built-in block. */
  readonly custom: boolean
}

/** A custom component's props as a view gives them: plain data, or `r.field` where it takes a field's name. */
export type ViewProps<P> = { [K in keyof Omit<P, 'children'>]: P[K] extends string ? P[K] | Ref : P[K] }

/** @inline */
type Naming = { name?: string; label?: string; icon?: string }

const naming = ({ label, icon }: Naming) => ({ ...(label !== undefined && { label }), ...(icon !== undefined && { icon }) })

/** The most photos a card steps through, its own image among them, each marked by a dot: a list includes this many of each record's photos. */
export const cardPhotoLimit = 10

/** The name of the list's own display, which every list has. */
export const tableDisplay = 'table'

/** The component of a custom display or section, which must be a project's, not a built-in block. */
export const customComponent = (component: ComponentRef<never>, where: string) => {
  if (!component.custom) throw new Error(`${where} takes a component declared with component(...), not the built-in block ${component.blockName}`)
  return component.blockName
}

export const displays = {
  /**
   * A card per record: `image`, a file field shown as a picture across the card's top, then `title` (default: the
   * view's title) over `subtitle`, `badge` drawn as a badge with its value labels, `amount` the first of its fields with a
   * value in bold, such as a purchase price or a rent, and a few small `meta` fields such as dates. `footer` is a line at
   * the card's bottom of its fields with a value, joined by bullets. `flags` are boolean fields shown as small badges of their labels when true, such as a garden or parking.
   * `dots` are related columns of the list (`c.related`), each a line of its dots under the rest of the card, with the
   * colours, order and hover cards they have in the table; a column with no records for the row shows no line.
   * With `card`, a component of the project or a plugin draws each card's content instead, from the row of those
   * fields (`{ row }`); without it, or when it throws, the card is the built-in one. With `photos`, the built-in card's
   * picture gets arrows through the `image` of the records of another resource that point at the card's record, after
   * its own `image`, ten pictures at most; they come with the list's records, so its dots mark the one shown from the
   * start. A list's cards displays name the same `photos`. With `favorite`, a heart in the card's top right corner saves
   * the record to the signed-in user's own records of another resource, such as favorites, and takes it off again; a
   * visitor who is not signed in is told why to sign in. Named `cards` unless `name` says otherwise.
   */
  cards: (
    fields: { image?: Ref; title?: Ref; subtitle?: Ref; amount?: Ref[]; badge?: Ref; meta?: Ref[]; footer?: Ref[]; flags?: Ref[]; dots?: ListColumn[] },
    o: Naming & { card?: ComponentRef<never>; photos?: CardPhotosModel; favorite?: CardFavoriteModel } = {},
  ): ListDisplayModel => ({
    kind: 'cards',
    name: o.name ?? 'cards',
    ...naming(o),
    ...(fields.image && { image: fields.image.name }),
    ...(fields.title && { title: fields.title.name }),
    ...(fields.subtitle && { subtitle: fields.subtitle.name }),
    ...(fields.amount && { amount: fields.amount.map((ref) => ref.name) }),
    ...(fields.badge && { badge: fields.badge.name }),
    ...(fields.meta && { meta: fields.meta.map((ref) => ref.name) }),
    ...(fields.footer && { footer: fields.footer.map((ref) => ref.name) }),
    ...(fields.flags && { flags: fields.flags.map((ref) => ref.name) }),
    ...(fields.dots && { dots: fields.dots.map((column) => column.name) }),
    ...(o.card && { card: customComponent(o.card, 'd.cards card') }),
    ...(o.photos && { photos: { ...o.photos } }),
    ...(o.favorite && { favorite: { ...o.favorite } }),
  }),
  /**
   * A map of the records at their `latitude` and `longitude`, filterable fields in decimal degrees, drawn with the app's
   * map style. It asks for the records in its view as it pans and zooms: from far out a count for each part of the map,
   * which zooms in when chosen, closer in the records. A marker stands for the records that lie close together at the
   * zoom; choosing it shows their card at the map's bottom, with arrows through them. The card is the one of the cards display named `cards`, the list's first cards display
   * when it names none, or the record's title alone without one. A record's position is approximate when its boolean
   * `approximate` field is true, or its `exact` field false: its marker is drawn hollow and says so, and close enough in
   * an area is drawn around it, the GeoJSON polygon or line its `area` field holds, else a circle of its `radius` field
   * in metres, else one of `defaultRadius`. Named `map` unless `name` says otherwise. See
   * [Approximate positions](website/src/content/docs/reference/ui-config.mdx#approximate-positions).
   */
  map: (
    fields: { latitude: Ref; longitude: Ref; approximate?: Ref; exact?: Ref; radius?: Ref; area?: Ref },
    o: Naming & { cards?: string; defaultRadius?: number } = {},
  ): ListDisplayModel => ({
    kind: 'map',
    name: o.name ?? 'map',
    ...naming(o),
    latitude: fields.latitude.name,
    longitude: fields.longitude.name,
    ...(o.cards !== undefined && { cards: o.cards }),
    ...(fields.approximate && { approximate: fields.approximate.name }),
    ...(fields.exact && { exact: fields.exact.name }),
    ...(fields.radius && { radius: fields.radius.name }),
    ...(o.defaultRadius !== undefined && { defaultRadius: o.defaultRadius }),
    ...(fields.area && { area: fields.area.name }),
  }),
  /**
   * A column per value of the enum field `by`, in the order the field lists them, each headed by its value label and how
   * many of the list's records have it; with a column for records without a value when the field may be empty. Each
   * column pages through the list API with the list's filter and search, its value added, in the list's order. A card
   * shows `title` (default: the view's title) over `subtitle`, with `badge` and a few small `meta` fields, as the built-in
   * card of `d.cards` does, and opens the record. Dragging a card to another column, or picking it up with Space and
   * moving it with the arrow keys, saves the record with `by` set to that column's value, as one update with its ETag,
   * so the resource's access rules and `validate` decide, and a refusal puts the card back and says why. `by` must be
   * a filterable enum field. Named `board` unless `name` says otherwise. See
   * [Boards](website/src/content/docs/reference/ui-config.mdx#boards).
   */
  board: (fields: { by: Ref; title?: Ref; subtitle?: Ref; badge?: Ref; meta?: Ref[] }, o: Naming = {}): ListDisplayModel => ({
    kind: 'board',
    name: o.name ?? 'board',
    ...naming(o),
    by: fields.by.name,
    ...(fields.title && { title: fields.title.name }),
    ...(fields.subtitle && { subtitle: fields.subtitle.name }),
    ...(fields.badge && { badge: fields.badge.name }),
    ...(fields.meta && { meta: fields.meta.map((ref) => ref.name) }),
  }),
  /**
   * The list drawn by a component of the project, registered in `protobase.ui.tsx` under its name. It gets `props` and
   * reads the rows with `useListDisplay()`; `fields` are the fields it shows, fetched with relation names.
   */
  custom: <P extends object>(component: ComponentRef<P>, o: Naming & { name: string; label: string; fields: Ref[]; props?: ViewProps<P> }): ListDisplayModel => ({
    kind: 'custom',
    name: o.name,
    label: o.label,
    ...naming({ icon: o.icon }),
    component: customComponent(component as ComponentRef<never>, 'd.custom'),
    fields: o.fields.map((ref) => ref.name),
    ...(o.props && { props: markFieldRefs(o.props) as Record<string, JsonValue> }),
  }),
}

const displayName = /^[a-z][a-zA-Z0-9-]*$/

/** What is wrong with a list's displays and default, by their names alone. */
export const displayErrors = (list: { displays?: ListDisplayModel[]; default?: string; relatedColumns?: RelatedColumnModel[] }): string[] => {
  const names = (list.displays ?? []).map((display) => display.name)
  return [
    ...names.filter((name) => !displayName.test(name)).map((name) => `display name "${name}" must start with a lowercase letter and hold only letters, digits and dashes`),
    ...names.filter((name) => name === tableDisplay).map(() => `"${tableDisplay}" is the list's own display; give the display another name`),
    ...names.filter((name, index) => names.indexOf(name) !== index).map((name) => `display "${name}" is defined twice`),
    ...(list.displays ?? []).flatMap((display) =>
      display.kind === 'map' && display.cards !== undefined && !list.displays!.some((other) => other.kind === 'cards' && other.name === display.cards)
        ? [`display "${display.name}" names cards "${display.cards}", which is not a cards display of the list`]
        : [],
    ),
    ...(list.displays ?? []).flatMap((display) =>
      display.kind === 'cards'
        ? (display.dots ?? []).filter((name) => !list.relatedColumns?.some((column) => column.name === name)).map((name) => `display "${display.name}" shows dots of "${name}", which is not a related column of the list`)
        : [],
    ),
    ...(list.displays ?? []).flatMap((display) => (display.kind === 'map' ? approximateErrors(display).map((error) => `display "${display.name}": ${error}`) : [])),
    ...(list.default === undefined || list.default === tableDisplay || names.includes(list.default) ? [] : [`default "${list.default}" is not one of the displays (${[tableDisplay, ...names].join(', ')})`]),
  ]
}

// An area surrounds an approximate position, so it needs the field that says which positions are.
const approximateErrors = (display: Extract<ListDisplayModel, { kind: 'map' }>) => {
  const { approximate, exact, radius, defaultRadius, area } = display
  if (approximate !== undefined && exact !== undefined) return ['name approximate or exact, not both']
  const surrounds = radius !== undefined || defaultRadius !== undefined || area !== undefined
  return [
    ...(surrounds && approximate === undefined && exact === undefined ? ['an area around approximate positions needs the approximate or exact field'] : []),
    ...(defaultRadius === undefined || (Number.isFinite(defaultRadius) && defaultRadius > 0) ? [] : [`defaultRadius ${defaultRadius} is not a number of metres above 0`]),
  ]
}

/** What makes a board unable to put the records in columns: a `by` field that is no filterable enum. */
export const boardErrors = (display: Extract<ListDisplayModel, { kind: 'board' }>, model: ResourceModel): string[] => {
  const field = Object.hasOwn(model.fields, display.by) ? model.fields[display.by]! : undefined
  // An unknown field is reported with every display's fields
  if (!field) return []
  if (field.type !== 'enum') return [`"${display.by}" on ${model.name} is ${field.type}, not an enum, whose values are the board's columns`]
  return field.filterable ? [] : [`"${display.by}" on ${model.name} is not filterable, and each column of the board filters by its value`]
}

/** Every field a display names: what it shows, a map's position and the fields saying how exact it is, a board's columns, and the field references in a custom display's props. */
export const displayFields = (display: ListDisplayModel): string[] => {
  if (display.kind === 'map') return [display.latitude, display.longitude, display.approximate, display.exact, display.radius, display.area].filter((name): name is string => name !== undefined)
  if (display.kind === 'custom') return [...display.fields, ...fieldRefsIn(display.props)]
  if (display.kind === 'board') return [display.by, display.title, display.subtitle, display.badge, ...(display.meta ?? [])].filter((name): name is string => name !== undefined)
  return [display.image, display.title, display.subtitle, ...(display.amount ?? []), display.badge, ...(display.meta ?? []), ...(display.footer ?? []), ...(display.flags ?? [])].filter((name): name is string => name !== undefined)
}
