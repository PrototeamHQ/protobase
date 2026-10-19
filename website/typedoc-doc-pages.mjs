import { relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Application, Converter } from 'typedoc'

/**
 * A TypeDoc plugin for the API reference, which starlight-typedoc generates while the site builds.
 *
 * A doc comment links to a guide or reference page by the page's file, as `[Access](website/src/content/docs/reference/access.mdx)`
 * (from the repository's root, or relative to the source file), and the reference gets the page's address on the
 * site, `/reference/access/`. A link to a file that is no page of the site is an error.
 *
 * starlight-typedoc renders without TypeDoc's validation, so this runs it, as the `typedoc` command does, and fails the
 * build on any error, or on a warning with `treatValidationWarningsAsErrors`: an item without a doc comment, a broken
 * `{@link}`, a link to a missing file. `bun run docs:api-check` runs the same validation, with the same options from
 * typedoc.json, without building the site.
 */
const root = fileURLToPath(new URL('..', import.meta.url))
const pages = fileURLToPath(new URL('src/content/docs/', import.meta.url))

/** The page's address on the site, or `undefined` when the file is not a page. */
const pageAddress = (file) => {
  const path = relative(pages, file).split(sep).join('/')
  if (path.startsWith('../') || !/\.mdx?$/.test(path)) return undefined
  const slug = path.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '')
  return slug === '' ? '/' : `/${slug}/`
}

/** @param {import('typedoc').Application} app */
export const load = (app) => {
  app.converter.on(Converter.EVENT_RESOLVE_END, (context) => {
    const project = context.project
    for (const reflection of Object.values(project.reflections)) {
      const comment = reflection.comment
      if (!comment) continue
      for (const parts of [comment.summary, ...comment.blockTags.map((tag) => tag.content)]) {
        for (const [index, part] of parts.entries()) {
          if (part.kind !== 'relative-link' || part.target === undefined) continue
          const file = project.files.resolvePath(part.target)
          const address = pageAddress(file)
          if (address === undefined) {
            app.logger.error(`${reflection.getFriendlyFullName()} links to ${relative(root, file)}, which is no page of the documentation site`)
            continue
          }
          parts[index] = { kind: 'text', text: part.targetAnchor ? `${address}#${part.targetAnchor}` : address }
        }
      }
    }
  })

  app.on(Application.EVENT_GENERATE_OUTPUTS_BEGIN, (project) => {
    // As the typedoc command decides, so the build fails where `typedoc` would.
    const warnings = app.logger.warningCount
    app.validate(project)
    const warned = app.logger.warningCount !== warnings || app.logger.validationWarningCount !== 0
    if (app.logger.hasErrors() || (warned && app.options.getValue('treatValidationWarningsAsErrors'))) {
      throw new Error(`The API reference of ${project.name} has the problems above`)
    }
  })
}
