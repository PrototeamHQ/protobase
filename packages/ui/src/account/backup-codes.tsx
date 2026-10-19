import { Check, Copy, Download } from 'lucide-react'
import { useState } from 'react'
import { saveFile } from '../lib/save-file'
import { Button } from '../primitives/button'
import { text } from './messages'

/** The backup codes, shown once, with ways to keep them: each works once instead of a code from the app. */
export const BackupCodes = ({ codes }: { codes: string[] }) => {
  const [copied, setCopied] = useState(false)
  const lines = `${codes.join('\n')}\n`
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={text('backupCodes')} className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border bg-surface p-3 font-mono">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(lines).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? text('copied') : text('copy')}
        </Button>
        <Button size="sm" onClick={() => saveFile(lines, 'backup-codes.txt')}>
          <Download className="size-3.5" />
          {text('download')}
        </Button>
      </div>
    </div>
  )
}
