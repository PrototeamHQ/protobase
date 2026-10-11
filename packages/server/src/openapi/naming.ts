/** A component name from a resource name: `stock_moves` and `stockMoves` both become `StockMoves`. */
export const pascal = (name: string) =>
  name
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
