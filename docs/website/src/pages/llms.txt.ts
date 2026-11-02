// llms.txt at the site's root, for chat assistants: see ../markdown/llms-txt.ts.
import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { architecture, features, featuresPage, gettingStarted, guides, reference } from '../../sidebar.mjs'
import { description } from '../../site.mjs'
import { llmsTxt } from '../markdown/llms-txt'

export const GET: APIRoute = async () => {
  const entries = new Map((await getCollection('docs')).map((entry) => [entry.id, entry.data]))
  const pages = (paths: string[]) =>
    paths.map((path) => {
      const page = entries.get(path)
      if (!page) throw new Error(`llms.txt: no docs page ${path}`)
      return { path, title: page.title, description: page.description }
    })
  const text = llmsTxt({
    description,
    sections: [
      { title: 'Getting started', pages: pages([gettingStarted]) },
      { title: 'Features', pages: pages([featuresPage, ...features]) },
      { title: 'Guides', pages: pages(guides) },
      { title: 'Reference', pages: pages(reference) },
      { title: 'Architecture', pages: pages(architecture) },
    ],
  })
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
