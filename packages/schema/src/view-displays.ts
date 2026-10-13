import { fieldRefsIn, markFieldRefs } from './field-ref'
import type { CardPhotosModel, JsonValue, ListDisplayModel } from './model'
import type { Ref } from './refs'

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
   * With `card`, a component of the project or a plugin draws each card's content instead, from the row of those
   * fields (`{ row }`); without it, or when it throws, the card is the built-in one. With `photos`, the built-in card's
   * picture gets arrows through the `image` of the records of another resource that point at the card's record, after
   * its own `image`; they load when an arrow is first pressed. Named `cards` unless `name` says otherwise.
   */
  cards: (
    fields: { image?: Ref; title?: Ref; subtitle?: Ref; amount?: Ref[]; badge?: Ref; meta?: Ref[]; footer?: Ref[]; flags?: Ref[] },
    o: Naming & { card?: ComponentRef<never>; photos?: CardPhotosModel } = {},
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
    ...(o.card && { card: customComponent(o.card, 'd.cards card') }),
    ...(o.photos && { photos: { ...o.photos } }),
  }),
  /**
   * A map of the records at their `latitude` and `longitude`, filterable fields in decimal degrees, drawn with the app's
   * map style. It asks for the records in its view as it pans and zooms: from far out a count for each part of the map,
   * which zooms in when chosen, closer in the records. A marker stands for the records that lie close together at the
   * zoom; choosing it shows their card at the map's bottom, with arrows through them. The card is the one of the cards display named `cards`, the list's first cards display
   * when it names none, or the record's title alone without one. Named `map` unless `name` says otherwise.
   */
  map: (fields: { latitude: Ref; longitude: Ref }, o: Naming & { cards?: string } = {}): ListDisplayModel => ({
    kind: 'map',
    name: o.name ?? 'map',
    ...naming(o),
    latitude: fields.latitude.name,
    longitude: fields.longitude.name,
    ...(o.cards !== undefined && { cards: o.cards }),
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
export const displayErrors = (list: { displays?: ListDisplayModel[]; default?: string }): string[] => {
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
    ...(list.default === undefined || list.default === tableDisplay || names.includes(list.default) ? [] : [`default "${list.default}" is not one of the displays (${[tableDisplay, ...names].join(', ')})`]),
  ]
}

/** Every field a display names: what it shows, a map's position, and the field references in a custom display's props. */
export const displayFields = (display: ListDisplayModel): string[] => {
  if (display.kind === 'map') return [display.latitude, display.longitude]
  if (display.kind === 'custom') return [...display.fields, ...fieldRefsIn(display.props)]
  return [display.image, display.title, display.subtitle, ...(display.amount ?? []), display.badge, ...(display.meta ?? []), ...(display.footer ?? []), ...(display.flags ?? [])].filter((name): name is string => name !== undefined)
}
