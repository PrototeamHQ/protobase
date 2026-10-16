/** Counts side by side, each under its label, such as the rows an import created and updated. */
export const ImportCounts = ({ label, counts }: { label: string; counts: Array<[label: string, value: number]> }) => (
  <dl aria-label={label} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
    {counts.map(([name, value]) => (
      <div key={name} className="rounded-lg border px-3 py-2">
        <dt className="text-xs text-muted-foreground">{name}</dt>
        <dd className="text-lg font-semibold tabular-nums">{value.toLocaleString('en-IE')}</dd>
      </div>
    ))}
  </dl>
)
