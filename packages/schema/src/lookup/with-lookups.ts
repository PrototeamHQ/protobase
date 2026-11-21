import type { ResourceModel } from '../model'

/** The model with its lookup fields among its fields, as a read and a view see them. */
export const withLookups = (model: ResourceModel): ResourceModel => {
  const { lookups, ...rest } = model
  return lookups ? { ...rest, fields: { ...model.fields, ...lookups } } : model
}
