import { cn } from '../lib/cn'

// The brand's colours, not the theme's: the corner is signal, the rest ink on light and paper on dark, whatever primary
// colour an app's theme picks.
const corner = 'fill-[#ff5a1f] dark:fill-[#ff6a33]'
export const solid = 'fill-[#14161a] dark:fill-[#f1f0ea]'

/** The Protobase mark, the Corner: the outlined corner is what an app describes, the solid rest what Protobase runs. */
export const LogoMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={cn('size-7 shrink-0', className)} aria-hidden>
    <path className={corner} fillRule="evenodd" d="M0 5a5 5 0 0 1 5-5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2zM4 5a1 1 0 0 1 1-1h5v6H4z" />
    <path className={solid} d="M17 0h10a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5H5a5 5 0 0 1-5-5V17h17z" />
  </svg>
)
