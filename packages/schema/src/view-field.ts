import type { FieldFormat, FieldViewModel } from './model'

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

  private with(patch: FieldViewModel) {
    return new FieldView<N, V>(this.name, { ...this.props, ...patch })
  }
}
