import { formatTag } from '../../locale/active-locale'

/**
 * What a list that shows only its first `shown` of `total` records says about the rest, as "The first 10 of 37.";
 * nothing when it shows them all. An `estimated` total is the planner's, so it reads "about".
 */
export const cutOffNote = (shown: number, total: number, estimated: boolean) => {
  if (shown >= total) return undefined
  return `The first ${shown} of ${estimated ? 'about ' : ''}${total.toLocaleString(formatTag())}.`
}
