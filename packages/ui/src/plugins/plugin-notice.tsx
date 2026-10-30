import { useState } from 'react'
import { Puzzle, X } from 'lucide-react'
import type { PluginOff } from './merge-plugins'
import { text } from './messages'

/** Across the top of the app for its admins while plugins it should load are off: which, and why. */
export const PluginNotice = ({ off }: { off: readonly PluginOff[] }) => {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed || off.length === 0) return null
  return (
    <div role="region" aria-label={text('pluginsOff')} className="flex items-start gap-3 border-b border-warning/40 bg-warning-soft px-4 py-2 text-warning-text">
      <Puzzle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <ul className="min-w-0 flex-1 space-y-0.5 break-words">
        {off.map((plugin) => (
          <li key={plugin.url}>
            {text.rich('pluginOff', { plugin: <span className="font-semibold">{plugin.name ?? plugin.url}</span>, reason: plugin.reason })}
          </li>
        ))}
      </ul>
      <button type="button" aria-label={text('dismiss')} className="rounded p-0.5 hover:bg-warning/10" onClick={() => setDismissed(true)}>
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}
