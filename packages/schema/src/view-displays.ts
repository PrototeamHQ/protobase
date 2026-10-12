import { fieldRefsIn, markFieldRefs } from './field-ref'
import type { CardPhotosModel, JsonValue, ListDisplayModel } from './model'
import type { Ref } from './refs'

/** A custom component as `component(name)` from `@protobase/layout` declares it. */
export type ComponentRef<P> = ((props: P) => unknown) & { readonly blockName: string; readonly custom: boolean }

/** A custom component's props as a view gives them: plain data, or `r.field` where it takes a field's name. */
export type ViewProps<P> = { [K in keyof Omit<P, 'children'>]: P[K] extends string ? P[K] | Ref : P[K] }

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
   * view's title) over `subtitle`, `badge` drawn as a badge with its value labels, and a few small `meta` fields such as
   * dates. `flags` are boolean fields shown as small badges of their labels when true, such as a garden or parking.
   * With `card`, a component of the project or a plugin draws each card's content instead, from the row of those
   * fields (`{ row }`); without it, or when it throws, the card is the built-in one. With `photos`, the built-in card's
   * picture gets arrows through the `image` of the records of another resource that point at the card's record, after
   * its own `image`; they load when an arrow is first pressed. Named `cards` unless `name` says otherwise.
   */
  cards: (
    fields: { image?: Ref; title?: Ref; subtitle?: Ref; badge?: Ref; meta?: Ref[]; flags?: Ref[] },
    o: Naming & { card?: ComponentRef<never>; photos?: CardPhotosModel } = {},
  ): ListDisplayModel => ({
    kind: 'cards',
    name: o.name ?? 'cards',
    ...naming(o),
    ...(fields.image && { image: fields.image.name }),
    ...(fields.title && { title: fields.title.name }),
    ...(fields.subtitle && { subtitle: fields.subtitle.name }),
    ...(fields.badge && { badge: fields.badge.name }),
    ...(fields.meta && { meta: fields.meta.map((ref) => ref.name) }),
    ...(fields.flags && { flags: fields.flags.map((ref) => ref.name) }),
    ...(o.card && { card: customComponent(o.card, 'd.cards card') }),
    ...(o.photos && { photos: { ...o.photos } }),
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
    ...(list.default === undefined || list.default === tableDisplay || names.includes(list.default) ? [] : [`default "${list.default}" is not one of the displays (${[tableDisplay, ...names].join(', ')})`]),
  ]
}

/** Every field a display names: what it shows, and the field references in a custom display's props. */
export const displayFields = (display: ListDisplayModel): string[] =>
  display.kind === 'cards'
    ? [display.image, display.title, display.subtitle, display.badge, ...(display.meta ?? []), ...(display.flags ?? [])].filter((name): name is string => name !== undefined)
    : [...display.fields, ...fieldRefsIn(display.props)]
