import type { ViewModel } from './model'

/**
 * The view a list page shows: `view` itself, or, with `list`, the view with that named list's names, nav, help, list,
 * filters and chart in place of its own, and no named lists; none when the view has no list by that name.
 */
export const viewOfList = (view: ViewModel | undefined, list: string | undefined): ViewModel | undefined => {
  if (list === undefined) return view
  const named = view?.lists?.find((entry) => entry.name === list)
  if (!view || !named) return undefined
  const { list: _list, chart: _chart, help: _help, nav: _nav, lists: _lists, names: _names, ...rest } = view
  const { name: _name, ...parts } = named
  return { ...rest, ...parts }
}
