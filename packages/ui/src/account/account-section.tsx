import type { ReactNode } from 'react'

/** One part of the account page: a title with its status, what it is, and its controls. */
export const AccountSection = ({ title, status, description, children }: { title: string; status?: ReactNode; description: ReactNode; children?: ReactNode }) => (
  <section aria-label={title} className="rounded-lg border bg-background p-4 sm:p-5">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {status}
    </div>
    <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>
    {children && <div className="mt-4">{children}</div>}
  </section>
)

export const SectionError = ({ message }: { message?: string }) =>
  message ? (
    <p role="alert" className="mb-3 text-xs font-medium text-danger-text">
      {message}
    </p>
  ) : null
