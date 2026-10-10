import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/** One message of a chat: the user's as a bubble on the right, the other side's as plain content, cards included. */
export const ChatMessage = ({ from, children }: { from: 'user' | 'assistant'; children: ReactNode }) => (
  <div
    data-from={from}
    className={cn(
      'flex min-w-0 flex-col gap-2 whitespace-pre-wrap break-words text-[13px]',
      from === 'user' ? 'ml-8 self-end rounded-lg rounded-br-sm bg-primary px-3 py-2 text-primary-foreground shadow-sm' : 'mr-4 text-foreground',
    )}
  >
    {children}
  </div>
)
