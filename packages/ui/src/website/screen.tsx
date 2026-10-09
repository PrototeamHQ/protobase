import type { ReactNode } from 'react'

export const Screen = ({ children }: { children: ReactNode }) => <div className="h-screen w-screen overflow-hidden">{children}</div>
