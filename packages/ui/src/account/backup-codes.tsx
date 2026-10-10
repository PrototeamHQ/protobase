import { Check, Copy, Download } from 'lucide-react'
import { useState } from 'react'
import { Button } from '../primitives/button'

/** The backup codes, shown once, with ways to keep them: each works once instead of a code from the app. */
export const BackupCodes = ({ codes }: { codes: string[] }) => {
  const [copied, setCopied] = useState(false)
  const text = `${codes.join('\n')}\n`
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Backup codes" className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border bg-surface p-3 font-mono text-[13px]">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button size="sm" onClick={() => saveText(text, 'backup-codes.txt')}>
          <Download className="size-3.5" />
          Download
        </Button>
      </div>
    </div>
  )
}

const saveText = (text: string, name: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: name })
  link.click()
  URL.revokeObjectURL(url)
}
