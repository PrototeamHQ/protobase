// Every docs page's Markdown at its own path plus .md: /reference/cli/ is also /reference/cli.md.
import type { APIRoute, GetStaticPaths } from 'astro'
import { getCollection, type CollectionEntry } from 'astro:content'
import { pageMarkdown } from '../markdown/page-markdown'

export const getStaticPaths = (async () => {
  const entries = await getCollection('docs')
  return entries.map((entry) => ({ params: { slug: entry.id }, props: { entry } }))
}) satisfies GetStaticPaths

export const GET: APIRoute<{ entry: CollectionEntry<'docs'> }> = ({ props: { entry } }) => {
  if (entry.body === undefined || entry.filePath === undefined) throw new Error(`${entry.id}: no source to publish as Markdown`)
  const markdown = pageMarkdown({ title: entry.data.title, description: entry.data.description, body: entry.body, filePath: entry.filePath })
  return new Response(markdown, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
}
