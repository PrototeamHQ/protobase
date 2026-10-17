import type { BadgeShape, FieldFormat, FieldViewModel, HelpWhen, JsonValue, ShowWhen } from './model'

const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

/** How a view shows one field, as `.fields((r) => ...)` hands it out: each hint returns a new field view. */
export class FieldView<N extends string = string, V = unknown> {
  /** @internal */
  constructor(
    /** The field's name. */
    readonly name: N,
    /** The hints given so far. */
    readonly props: FieldViewModel = {},
  ) {}

  /** What the field is called, instead of its name in words. */
  label(label: string) {
    return this.with({ label })
  }

  /**
   * A line under the field on the record page and in forms; `when: 'editing'` shows it only while the record is edited,
   * not on its read view (the view's `.helpWhen(...)` when omitted).
   */
  help(help: string, o: { when?: HelpWhen } = {}) {
    return this.with({ help, ...(o.when !== undefined && { helpWhen: o.when }) })
  }

  /**
   * When the field shows on the record page: `editing` only on its form and the create form, `reading` only on its read
   * view and locked form; `always` when omitted. Its lists, cards and filters show it either way.
   */
  when(when: ShowWhen) {
    return this.with({ when })
  }

  /** How the value shows: `badge` for statuses, `code` in monospace, `percent` with a % sign. */
  format(format: FieldFormat) {
    return this.with({ format })
  }

  /**
   * A text of several lines, such as a description: forms edit it in a box that grows with the text, and the record
   * page and cards keep its line breaks. Only a text field takes it.
   */
  multiline() {
    return this.with({ multiline: true })
  }

  /**
   * Markdown, such as notes: forms edit its source with a Write and Preview switch, and the record page, a page's field
   * blocks and a card's subtitle show it rendered, raw HTML shown as text and links opening in a new tab; the list's
   * table shows its text on one line. Only a text field takes it.
   */
  markdown() {
    return this.with({ markdown: true })
  }

  /** Text before a number wherever it is shown, such as a currency: `.prefix('€')`. */
  prefix(prefix: string) {
    return this.with({ prefix })
  }

  /** Text after a number wherever it is shown, such as a unit: `.suffix(' m²')`. */
  suffix(suffix: string) {
    return this.with({ suffix })
  }

  /** How many decimals a number shows wherever it is shown. */
  decimals(decimals: number) {
    return this.with({ decimals })
  }

  /** Labels for an enum's values, such as `{ co_signer: 'Co-signer' }`; values left out read as themselves in words. */
  valueLabels(labels: { readonly [P in Extract<V, string>]?: string }) {
    return this.with({ valueLabels: { ...this.props.valueLabels, ...(labels as Record<string, string>) } })
  }

  /** A hex colour per enum value that fills its badge, such as `{ a: '#00a651' }`; values left out keep their tone. */
  valueColors(colors: { readonly [P in Extract<V, string>]?: string }) {
    const entries = Object.entries(colors as Record<string, string>)
    const wrong = entries.find(([, color]) => !hexColor.test(color))
    if (wrong) throw new Error(`Field "${this.name}": value colour "${wrong[1]}" of "${wrong[0]}" is not a hex colour such as #00a651`)
    return this.with({ valueColors: { ...this.props.valueColors, ...Object.fromEntries(entries) } })
  }

  /** `arrow` draws the field's badges as arrows pointing right, as on a rating scale such as the EU energy label. */
  badgeShape(badgeShape: BadgeShape) {
    return this.with({ badgeShape })
  }

  /**
   * An icon before the value on a card's meta row and above it in a section of key facts, by the names actions take,
   * such as `ruler`.
   */
  icon(icon: string) {
    return this.with({ icon })
  }

  /**
   * Shows and edits the field with the field type a plugin registers under `name` (`definePlugin({ fields })`), given
   * `props`, such as `r.score.widget('rating', { max: 5 })`. Without that plugin, or when the field type does not show
   * this field's storage type, the field shows as it would without it.
   */
  widget(name: string, props?: Record<string, JsonValue>) {
    return this.with({ widget: { name, ...(props && { props }) } })
  }

  private with(patch: FieldViewModel) {
    return new FieldView<N, V>(this.name, { ...this.props, ...patch })
  }
}
