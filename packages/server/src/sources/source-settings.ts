import { checkedUrl } from '../assistant/assistant-settings'

/**
 * Another Protobase API whose resources the admin app draws as its own: `url` is its resources API (`.../api/v1`),
 * `label` names it to people when it cannot be reached, and `resources` are the ones the app draws from it, at their
 * own addresses. With `roles`, `/meta` names it only to callers holding one of them; without, to everyone.
 */
export type SourceOption = { url: string; label: string; resources: string[]; roles?: string[] }

/** A source as `/meta` names it to a caller. */
export type SourceRef = { url: string; label: string; resources: string[] }

/** The platform's sources, as a JSON list of `SourceOption`, drawn after the ones `options.sources` lists. */
export const sourcesVariable = 'PROTOBASE_SOURCES'

const sourceKeys = new Set(['url', 'label', 'resources', 'roles'])

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

// A resource name the app's addresses can carry: `/-/` is the app's own pages, and a slash would split the address.
const resourceNameProblem = (name: string) => (name === '' ? 'is empty' : name === '-' ? 'is the prefix of the app\'s own pages' : name.includes('/') ? 'holds a slash' : undefined)

const checkedSource = (value: unknown, where: string): SourceOption => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${where} is not an object such as { "url": "https://...", "label": "...", "resources": ["..."] }`)
  const unknown = Object.keys(value).filter((key) => !sourceKeys.has(key))
  if (unknown.length > 0) throw new Error(`${where} has ${unknown.map((key) => `"${key}"`).join(', ')}, which a source does not take; it takes url, label, resources and roles`)
  const { url, label, resources, roles } = value as Record<string, unknown>
  if (typeof url !== 'string') throw new Error(`${where} needs a url, the other API's resources API such as https://other.example.com/api/v1`)
  if (typeof label !== 'string' || label.trim() === '') throw new Error(`${where} needs a label, its name as people read it`)
  if (!isStringList(resources) || resources.length === 0) throw new Error(`${where} needs resources, a list of the resource names the app draws from it`)
  for (const name of resources) {
    const problem = resourceNameProblem(name)
    if (problem) throw new Error(`${where} lists the resource "${name}", which ${problem}`)
  }
  if (roles !== undefined && !isStringList(roles)) throw new Error(`${where} has roles that are not a list of role names`)
  return { url: checkedUrl(url.trim(), `${where}'s url`), label: label.trim(), resources, ...(roles && { roles }) }
}

const listedSources = (env: Record<string, string | undefined>) => {
  const text = env[sourcesVariable]?.trim()
  if (!text) return []
  const parse = () => {
    try {
      return JSON.parse(text) as unknown
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`${sourcesVariable} is not JSON; it is a list such as [{ "url": "https://...", "label": "...", "resources": ["..."] }]`)
      throw error
    }
  }
  const parsed = parse()
  if (!Array.isArray(parsed)) throw new Error(`${sourcesVariable} is not a list; it is a list such as [{ "url": "https://...", "label": "...", "resources": ["..."] }]`)
  return parsed.map((value, index) => checkedSource(value, `${sourcesVariable}[${index}]`))
}

/**
 * The sources the app draws resources from: those `options.sources` lists, then those `PROTOBASE_SOURCES` adds; `false`
 * turns both off. A source that cannot work, one listed twice, or a resource two sources draw stops the server at
 * startup.
 */
export const sourceOptions = (option: SourceOption[] | false | undefined, env: Record<string, string | undefined>): SourceOption[] => {
  if (option === false) return []
  const all = [...(option ?? []).map((value, index) => checkedSource(value, `options.sources[${index}]`)), ...listedSources(env)]
  const urls = new Set<string>()
  const drawn = new Map<string, string>()
  for (const source of all) {
    if (urls.has(source.url)) throw new Error(`The source ${source.url} is listed twice; list it once, with every resource the app draws from it`)
    urls.add(source.url)
    for (const name of source.resources) {
      const other = drawn.get(name)
      if (other !== undefined) throw new Error(`The resource "${name}" is drawn from ${other === source.url ? `${other} twice` : `both ${other} and ${source.url}`}; draw it from one source, once`)
      drawn.set(name, source.url)
    }
  }
  return all
}

/**
 * Fails at startup when a source draws a resource under a name the app already uses, for one of its own resources or
 * a composed page: the address `/<name>` would mean two things.
 */
export const checkSourceNames = (sources: readonly SourceOption[], own: { resources: readonly string[]; pages: readonly string[] }) => {
  for (const source of sources) {
    for (const name of source.resources) {
      const clash = own.resources.includes(name) ? 'resource' : own.pages.includes(name) ? 'page' : undefined
      if (clash) throw new Error(`The source ${source.label} (${source.url}) draws the resource "${name}", which is also a ${clash} of the app's own; rename one of them, or leave it out of the source's resources`)
    }
  }
}

/** The sources `/meta` names to a caller with `roles`: those for everyone, and those for one of their roles. */
export const sourcesFor = (sources: readonly SourceOption[], roles: readonly string[]): SourceRef[] =>
  sources.filter((source) => !source.roles || source.roles.some((role) => roles.includes(role))).map(({ url, label, resources }) => ({ url, label, resources }))
