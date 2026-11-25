import { CompiledQuery } from 'kysely'

export const query = CompiledQuery.raw('select * from auth.member where organization_id = $1', ['1'])
