import type { CompareOp, FieldType } from '../model'

const equality: CompareOp[] = ['=', '!=']
const ordered: CompareOp[] = ['=', '!=', '<', '<=', '>', '>=']

export const compareOps = (type: FieldType): CompareOp[] => {
  switch (type) {
    case 'text':
    case 'integer':
    case 'bigint':
    case 'decimal':
    case 'date':
    case 'timestamp':
      return ordered
    case 'json':
    case 'file':
      return []
    default:
      return equality
  }
}

export const isOpaque = (type: FieldType) => type === 'json' || type === 'file'
