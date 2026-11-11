import { cn } from '../lib/cn'

export type AvatarProps = { initials: string; hue: number; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }

const sizes = { xs: 'size-5 text-[0.5625rem]', sm: 'size-6 text-[0.625rem]', md: 'size-8 text-xs', lg: 'size-10 text-base' }

export const Avatar = ({ initials, hue, size = 'sm', className }: AvatarProps) => (
  <span
    className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ring-2 ring-background', sizes[size], className)}
    style={{ background: `oklch(0.58 0.13 ${hue})` }}
  >
    {initials}
  </span>
)

export const AvatarStack = ({ people, size = 'sm' }: { people: Array<{ initials: string; hue: number }>; size?: AvatarProps['size'] }) => (
  <span className="inline-flex -space-x-1">
    {people.map((person) => (
      <Avatar key={person.initials} {...person} size={size} />
    ))}
  </span>
)
