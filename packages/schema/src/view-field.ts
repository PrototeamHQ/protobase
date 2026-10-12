import type { BadgeShape, FieldFormat, FieldViewModel, JsonValue } from './model'

const hexColor = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export class FieldView<N extends string = string, V = unknown> {
  constructor(
    readonly name: N,
    readonly props: FieldViewModel = {},
  ) {}

  label(label: string) {
    return this.with({ label })
  }

  help(help: string) {
    return this.with({ help })
  }

  format(format: FieldFormat) {
    return this.with({ format })
  }

  prefix(prefix: string) {
    return this.with({ prefix })
  }

  /** Text after a number wherever it is shown, such as a unit: `.suffix(' m²')`. */
  suffix(suffix: string) {
    return this.with({ suffix })
  }

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

  /** An icon before the value on a card's meta row, by the names actions take, such as `ruler`. */
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
