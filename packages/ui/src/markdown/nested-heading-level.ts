/**
 * The level a markdown heading of `depth` takes under a heading of level `under`: one below it at the least, so `#` and
 * `##` both become the level under it and `###` the one after, and never past h6. With nothing above it, `depth` stays.
 */
export const nestedHeadingLevel = (depth: number, under: number) => {
  if (under === 0) return depth
  return Math.min(6, Math.max(under + 1, depth + under - 1))
}
