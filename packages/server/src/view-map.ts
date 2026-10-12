import type { MapSectionModel, ResourceModel } from '@protobase/schema'

const coordinateTypes = new Set(['integer', 'bigint', 'decimal'])

// MapLibre's zoom levels, from the whole world at 0 to a building at 22.
const maxZoom = 22

// The app reads a position as decimal degrees, so each field is a number the resource has.
const coordinateErrors = (model: ResourceModel, name: string) => {
  const field = Object.hasOwn(model.fields, name) ? model.fields[name]! : undefined
  if (!field) return [`unknown field "${name}" on ${model.name}`]
  if (!coordinateTypes.has(field.type)) return [`"${name}" on ${model.name} is ${field.type}, not a number of degrees`]
  return []
}

/** What makes a map section unable to show the record's position: a field that is no number, or a zoom MapLibre has not. */
export const mapErrors = (item: MapSectionModel, model: ResourceModel) => [
  ...coordinateErrors(model, item.latitude),
  ...coordinateErrors(model, item.longitude),
  ...(item.zoom === undefined || (Number.isFinite(item.zoom) && item.zoom >= 0 && item.zoom <= maxZoom) ? [] : [`zoom ${item.zoom} is not between 0 and ${maxZoom}`]),
]
