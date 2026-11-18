import { auth } from './auth'
import { mailSenders } from './mail-senders'
import { mcp } from './mcp'
import { organizations } from './organizations'
import { passkeys } from './passkeys'
import { personalAccessTokens } from './personal-access-tokens'
import { platformDevices } from './platform-devices'
import { signInPolicy } from './sign-in-policy'
import { staffSignIn } from './staff-sign-in'
import { twoFactor } from './two-factor'

/** Every built-in module of the auth store. */
export const builtInModules = [auth, twoFactor, passkeys, signInPolicy, staffSignIn, organizations, mcp, personalAccessTokens, mailSenders, platformDevices] as const

type Modules = (typeof builtInModules)[number]

export type ModuleId = Modules['id']

// Each helper below distributes over the modules, one at a time.

type TablesIn<M> = M extends { tables: infer T } ? keyof T & string : never

type OwnColumnsIn<M, Table extends string> = M extends { tables: Record<Table, { columns: infer C }> } ? C[keyof C] : never

type AddedColumnsIn<M, Table extends string> = M extends { columns: Record<Table, infer C> } ? C[keyof C] : never

type ColumnsIn<M, Table extends string> = M extends { tables: Record<Table, { columns: infer C }> } ? keyof C & string : M extends { columns: Record<Table, infer C> } ? keyof C & string : never

type ColumnDeclarationOf<Table extends string> = OwnColumnsIn<Modules, Table> | AddedColumnsIn<Modules, Table>

type ModelTableIn<M, Model extends string> = M extends { tables: infer T } ? { [Table in keyof T]: T[Table] extends { model: Model } ? Table : never }[keyof T] & string : never

/** Every built-in table, by internal name, with the internal names of its columns, those other modules add included. */
export type BuiltInTables = { [Table in TablesIn<Modules>]: ColumnsIn<Modules, Table> }

/** The fields Protobase defines itself on a built-in table. */
export type OwnField<Table extends string> = Extract<ColumnDeclarationOf<Table>, { attribute: object }>['field']

/** The attribute of a field Protobase defines on a built-in table. */
export type OwnAttribute<Table extends string, Field extends string> = Extract<ColumnDeclarationOf<Table>, { field: Field; attribute: object }>['attribute']

/** Every field of a built-in table, its own and those other modules add. */
export type FieldOf<Table extends string> = ColumnDeclarationOf<Table>['field']

/** The built-in table that holds Better Auth's model. */
export type TableOfModel<Model extends string> = ModelTableIn<Modules, Model>
