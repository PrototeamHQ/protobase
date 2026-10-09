import { cn } from '../lib/cn'

export const ChatMessage = ({ from, text }: { from: 'user' | 'assistant'; text: string }) => (
  <div
    className={cn(
      'whitespace-pre-wrap break-words text-[13px]',
      from === 'user' ? 'ml-8 self-end rounded-lg rounded-br-sm bg-primary px-3 py-2 text-primary-foreground shadow-sm' : 'mr-4 text-foreground',
    )}
  >
    {text}
  </div>
)
