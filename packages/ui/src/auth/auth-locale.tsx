import type { ReactNode } from 'react'
import { AppLocale } from '../locale/app-locale'
import { useAuth } from './auth-provider'

/**
 * Puts the screens below in the language the setup status names: the sign-in screens and public forms come before
 * `/meta`, and are in the app's language all the same.
 */
export const AuthLocale = ({ children }: { children: ReactNode }) => <AppLocale locale={useAuth().locale}>{children}</AppLocale>
