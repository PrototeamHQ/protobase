import { dataLayout, Email, fillProps, formatText, mailTreeProblems, readerLanguage, scopeValue, Text, translationProblems, type LayoutChildren, type LayoutNode, type Recorded, type Translations, type ValueScope } from '@protobase/layout'
import { fillText, valueText } from '@protobase/schema/internal'
import type { RenderedEmail } from '../define-email'
import type { MailAttachment, Mailer } from '../mail-message'
import { mailFromVariable, smtpUrlVariable } from '../mail-settings'
import type { MailingApp } from '../mailing-app'
import { platformMailer } from '../platform-mailer'
import { derivedSchema, type JsonSchema } from './template-schema'

// An email template: a static tree of mail blocks, written with typed data in hand as a typed layout is, its texts in
// each of the app's languages, and its data checked by a schema of the app's or one derived from what it reads.

/** A Standard Schema (https://standardschema.dev), such as zod 4's or Valibot's, with its JSON Schema when it gives one. */
export type TemplateSchema<Output = unknown> = {
  readonly '~standard': {
    readonly version: 1
    readonly validate: (value: unknown) => { value: Output; issues?: undefined } | { issues: ReadonlyArray<TemplateIssue> } | Promise<{ value: Output; issues?: undefined } | { issues: ReadonlyArray<TemplateIssue> }>
    readonly types?: { readonly input: unknown; readonly output: Output }
    readonly jsonSchema?: { readonly input: (options: { target: 'draft-07' }) => Record<string, unknown> }
  }
}

type TemplateIssue = { message: string; path?: ReadonlyArray<PropertyKey | { key: PropertyKey }> }

/** What a template's body, subject and preview are written with: its data, and the app it is sent from, recorded. */
export type TemplateScope<Data> = { data: Recorded<Data>; app: Recorded<MailingApp> }

/** A text of the template: written, with `{{path}}`s or `${data.name}`, or a `<Trans>` in the send's language. */
export type TemplateText = string | LayoutNode

export type TemplateOptions<Data extends object> = {
  /** Names the template: in errors, in the workflow step's list and as the mail's `name`. Lowercase, digits and dashes. */
  name: string
  /** Its texts in each language it is sent in, `translations({ en, nl })`, which its `<Trans>` elements read. */
  texts?: Translations
  /** The subject line. */
  subject: TemplateText | ((scope: TemplateScope<Data>) => TemplateText)
  /** The line inboxes show after the subject. */
  preview?: TemplateText | ((scope: TemplateScope<Data>) => TemplateText)
  /**
   * More header fields, each one line that may read the data: such as `List-Unsubscribe` with the recipient's own
   * link, `` ({ data }) => ({ 'List-Unsubscribe': `<${data.unsubscribe_url}>` }) ``, which bulk mail should carry.
   */
  headers?: Record<string, string> | ((scope: TemplateScope<Data>) => Record<string, string>)
  /** Checks the data before a send, and gives the workflow step its fields; without it, they are derived from the tree. */
  schema?: TemplateSchema<Data>
  /** The mail's text: mail blocks, such as `<Text>`, `<Button href>` and `<Show when>`, with the data in hand. */
  body: (scope: TemplateScope<Data>) => LayoutChildren
}

/** A send's options: its language (a BCP 47 tag), the mailer, else the app's SMTP server, and attachments. */
export type TemplateSendOptions = { locale?: string; mailer?: Mailer; attachments?: MailAttachment[]; app?: MailingApp }

/** A mail as `render` gives it, with the language it is in. */
export type RenderedTemplate = RenderedEmail & { locale: string }

export type MailTemplate<Data extends object> = {
  readonly kind: 'mail-template'
  readonly name: string
  /** The languages the template is sent in, its texts' (`en` without texts). */
  readonly languages: readonly string[]
  /** The JSON Schema of its data: its schema's, or derived from what it reads. */
  readonly dataSchema: JsonSchema
  /** The static tree, its subject and its preview, as JSON. */
  readonly tree: LayoutNode
  /** Renders the mail for `data` in the language closest to `locale`, without sending it. Rejects data the schema refuses. */
  render(data: Data, options?: { locale?: string; app?: MailingApp }): Promise<RenderedTemplate>
  /** Renders the mail and sends it to `to` through `mailer`, else the app's SMTP server. Rejects when mail is off. */
  send(to: string, data: Data, options?: TemplateSendOptions): Promise<RenderedTemplate>
}

/** Data a template's schema refuses, naming each path; a workflow's step fails with `Mail.InvalidData` on it. */
export class TemplateDataError extends Error {
  constructor(
    readonly template: string,
    readonly issues: { path: string; message: string }[],
  ) {
    super(`Email "${template}" cannot be sent with this data: ${issues.map((issue) => `${issue.path || '(data)'}: ${issue.message}`).join('; ')}`)
    this.name = 'TemplateDataError'
  }
}

const templateName = /^[a-z][a-z0-9-]*$/

const fallbackApp: MailingApp = { name: 'Protobase', url: '' }

/** The app's own language, which a send without `locale` falls back to when the template has it: `configureTemplates` sets it. */
let appLocale: string | undefined

/** Sets the language a send without one prefers, the app's `locale`, as the server starts. */
export const configureTemplates = (options: { locale?: string }) => {
  appLocale = options.locale
}

/**
 * The language a send whose reader prefers `preferred` (a BCP 47 tag, such as their browser's) comes in: the app's
 * `locale` when the template has it, else the one of `languages` closest to `preferred`, else English.
 */
export const appOrReaderLanguage = (languages: readonly string[], preferred?: string) => readerLanguage(languages, preferred ? [preferred] : [], appLocale) ?? 'en'

const lazyRenderer = async () => {
  const [{ render, toPlainText }, { drawEmail }] = await Promise.all([import('@react-email/render'), import('./render-tree')])
  return { render, toPlainText, drawEmail }
}

const pathOf = (issue: TemplateIssue) => (issue.path ?? []).map((part) => String(typeof part === 'object' ? part.key : part)).join('.')

// A subject or preview, from the static text node it was built into, as plain text
const plainText = (node: LayoutNode, scope: ValueScope, texts: Parameters<typeof formatText>[0]) =>
  node.children
    .map((child) => {
      if (typeof child === 'string') return fillText(child, (path) => valueText(scopeValue(scope, path)))
      if (child.type !== 'Trans') return ''
      const values = fillProps(child, scope).props.values
      return formatText(texts, String(child.props.i18nKey), typeof values === 'object' && values !== null && !Array.isArray(values) ? values : {})
    })
    .join('')

/**
 * An email template the app sends, typed by its data: its subject, preview and body written as a typed layout's, in
 * mail blocks, its texts in each of its languages. Export it from `config/index.ts`, so the workflow step `Send email`
 * lists it. The tree is built once, here, and checked: a block an email cannot draw, a `<Trans>` key its texts lack,
 * and a malformed condition each throw.
 */
export const defineTemplate = <Data extends object = Record<string, unknown>>(options: TemplateOptions<Data>): MailTemplate<Data> => {
  if (!templateName.test(options.name)) throw new Error(`Email template name "${options.name}" must start with a lowercase letter and hold only lowercase letters, digits and dashes`)
  type Full = Data & { app: MailingApp }
  const scoped = (build: (scope: TemplateScope<Data>) => LayoutChildren) => dataLayout<Full>(({ data }) => build({ data: data as unknown as Recorded<Data>, app: (data as unknown as { app: Recorded<MailingApp> }).app }))
  const asText = (text: TemplateOptions<Data>['subject']) => scoped((scope) => Text({ children: typeof text === 'function' ? text(scope) : text }))
  const body = scoped((scope) => Email({ children: options.body(scope) }))
  const tree = body.type === 'Email' ? body : Email({ children: body })
  const subject = asText(options.subject)
  const preview = options.preview === undefined ? undefined : asText(options.preview)
  // Each header's value as a text node named by its field, so its recorded paths are written as the subject's are
  const headerFields = options.headers
  const headers = headerFields === undefined ? undefined : scoped((scope) => Email({ children: Object.entries(typeof headerFields === 'function' ? headerFields(scope) : headerFields).map(([name, value]) => Text({ className: name, children: value })) }))
  const parts = [{ at: 'body', tree }, { at: 'subject', tree: subject }, ...(preview ? [{ at: 'preview', tree: preview }] : []), ...(headers ? [{ at: 'headers', tree: headers }] : [])]
  const problems = [...mailTreeProblems(tree).map((problem) => `body: ${problem}`), ...translationProblems(parts, options.texts)]
  if (problems.length > 0) throw new Error(`Email template "${options.name}" is not valid:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)

  const languages = options.texts ? Object.keys(options.texts.languages) : ['en']
  const own = options.schema?.['~standard'].jsonSchema
  const derived = derivedSchema(parts.map((part) => part.tree)) as { properties?: Record<string, unknown>; required?: string[] }
  const withoutApp = { ...derived, ...(derived.properties && { properties: Object.fromEntries(Object.entries(derived.properties).filter(([name]) => name !== 'app')) }), ...(derived.required && { required: derived.required.filter((name) => name !== 'app') }) }
  const { $schema: _, ...dataSchema }: Record<string, unknown> = own ? own.input({ target: 'draft-07' }) : withoutApp

  const checked = async (data: Data): Promise<Data> => {
    if (!options.schema) return data
    const result = await options.schema['~standard'].validate(data)
    if (result.issues) throw new TemplateDataError(options.name, result.issues.map((issue) => ({ path: pathOf(issue), message: issue.message })))
    return result.value
  }

  const render = async (data: Data, { locale, app = fallbackApp }: { locale?: string; app?: MailingApp } = {}): Promise<RenderedTemplate> => {
    const value = await checked(data)
    const lang = readerLanguage(languages, locale ? [locale] : [], locale ? undefined : appLocale) ?? 'en'
    const texts = options.texts ? { locale: lang, messages: options.texts.languages[lang]! } : undefined
    const record = { ...value, app }
    const scope: ValueScope = { stack: [{ record }], root: record }
    const renderer = await lazyRenderer()
    const previewText = preview ? plainText(preview, scope, texts) : undefined
    const html = await renderer.render(renderer.drawEmail(tree, scope, { texts, app, lang, ...(previewText !== undefined && { preview: previewText }) }))
    const fields = headers && Object.fromEntries(headers.children.flatMap((child) => (typeof child === 'string' ? [] : [[String(child.props.className), plainText(child, scope, texts)]])))
    return { subject: plainText(subject, scope, texts), html, text: renderer.toPlainText(html), ...(fields && { headers: fields }), locale: lang }
  }

  const send = async (to: string, data: Data, { mailer = platformMailer(), attachments, ...rest }: TemplateSendOptions = {}) => {
    if (!mailer) throw new Error(`Email "${options.name}" cannot be sent: mail is off; set ${smtpUrlVariable} and ${mailFromVariable}`)
    const rendered = await render(data, rest)
    const { locale: _locale, ...message } = rendered
    await mailer.send({ to, ...message, ...(attachments && attachments.length > 0 && { attachments }) })
    return rendered
  }

  return { kind: 'mail-template', name: options.name, languages, dataSchema, tree: { ...tree, props: { ...tree.props, subject, ...(preview && { preview }) } }, render, send }
}

/** Whether a config export is an email template. */
export const isMailTemplate = (value: unknown): value is MailTemplate<object> => typeof value === 'object' && value !== null && (value as MailTemplate<object>).kind === 'mail-template' && typeof (value as MailTemplate<object>).render === 'function'

