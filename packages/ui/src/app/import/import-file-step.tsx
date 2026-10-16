import { FileSpreadsheet } from 'lucide-react'
import { useId } from 'react'
import { Spinner } from '../../primitives/spinner'
import { ImportSelect } from './import-select'

type ImportFileStepProps = {
  file?: File
  sheets: string[]
  sheet?: string
  reading: boolean
  onChoose: (file: File) => void
  onSheet: (sheet: string) => void
}

/** The file to import, an .xlsx workbook or a CSV, and the sheet to read from a workbook with several. */
export const ImportFileStep = ({ file, sheets, sheet, reading, onChoose, onSheet }: ImportFileStepProps) => {
  const id = useId()
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="font-medium">
          File
        </label>
        <input
          id={id}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          disabled={reading}
          onChange={(event) => {
            const chosen = event.target.files?.[0]
            if (chosen) onChoose(chosen)
          }}
          className="text-[13px] file:mr-3 file:h-8 file:rounded-md file:border file:border-border-strong file:bg-background file:px-3 file:font-medium file:text-foreground max-sm:file:min-h-11"
        />
        <p className="text-xs text-muted-foreground">An Excel workbook (.xlsx) or a CSV file saved as UTF-8. Its first row names the columns.</p>
      </div>
      {reading && (
        <p className="flex items-center gap-2 text-muted-foreground" role="status">
          <Spinner className="size-3.5" />
          Reading {file?.name ?? 'the file'}…
        </p>
      )}
      {!reading && sheets.length > 1 && (
        <div className="flex items-end gap-3">
          <FileSpreadsheet className="mb-2 size-4 shrink-0 text-muted-foreground" />
          <ImportSelect className="flex-1" label="Sheet" value={sheet ?? ''} options={sheets.map((name) => ({ value: name, label: name }))} onChange={onSheet} />
        </div>
      )}
    </div>
  )
}
