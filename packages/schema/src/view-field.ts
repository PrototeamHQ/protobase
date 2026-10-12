import type { FieldFormat, FieldViewModel, JsonValue } from './model'

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

  decimals(decimals: number) {
    return this.with({ decimals })
  }

  /** Labels for an enum's values, such as `{ co_signer: 'Co-signer' }`; values left out read as themselves in words. */
  valueLabels(labels: { readonly [P in Extract<V, string>]?: string }) {
    return this.with({ valueLabels: { ...this.props.valueLabels, ...(labels as Record<string, string>) } })
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
