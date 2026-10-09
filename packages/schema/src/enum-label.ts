/** How an enum value reads: its label from the view's `valueLabels`, else the stored value unchanged (`co_signer`). */
export const enumLabel = (value: string, labels?: Record<string, string>) => labels?.[value] ?? value
