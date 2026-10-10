/** Labelled values, one per row, inside a card. */
export const FieldList = ({ fields }: { fields: Array<{ label: string; value: string }> }) => (
  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
    {fields.map((field, index) => (
      <div key={`${index}-${field.label}`} className="contents">
        <dt className="text-muted-foreground">{field.label}</dt>
        <dd className="min-w-0 break-words">{field.value}</dd>
      </div>
    ))}
  </dl>
)
