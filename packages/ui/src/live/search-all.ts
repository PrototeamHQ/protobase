import type { Client, ListParams, RelatedLabels } from '@protobase/client'

// The list API's largest page
const pageSize = 500

/** Every record a search matches, page by page, so none is left out; with `labels`, the names of every page merged. */
export const searchAll = async (client: Client, resource: string, params: Omit<ListParams, 'pageSize' | 'pageToken'>) => {
  const items: Record<string, unknown>[] = []
  const labels: RelatedLabels = {}
  let pageToken: string | undefined
  do {
    const page = await client.search(resource, { ...params, pageSize, ...(pageToken && { pageToken }) })
    items.push(...(page.items as Record<string, unknown>[]))
    for (const [relation, names] of Object.entries(page.labels ?? {})) labels[relation] = { ...labels[relation], ...names }
    pageToken = page.nextPageToken || undefined
  } while (pageToken)
  return { items, labels }
}
