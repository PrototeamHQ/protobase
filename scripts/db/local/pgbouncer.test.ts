import { describe, expect, it } from 'vitest'
import { pgbouncerConfig, userList } from './pgbouncer'

describe('pgbouncerConfig', () => {
  const config = pgbouncerConfig({ user: 'protobase', port: 55432, poolerPort: 55442 })

  it('pools every database of the local server for the superuser', () => {
    expect(config).toContain('* = host=127.0.0.1 port=55432 auth_user=protobase')
    expect(config).toContain('admin_users = protobase')
  })

  it('listens where the Docker pooler is published, with its pooling settings', () => {
    expect(config).toContain('listen_addr = 127.0.0.1\nlisten_port = 55442')
    expect(config).toContain('pool_mode = transaction')
    expect(config).toContain('max_user_connections = 3')
    expect(config).toContain('max_prepared_statements = 200')
    expect(config).toContain('track_extra_parameters = statement_timeout')
  })
})

describe('userList', () => {
  it('lists the user with the password scram-sha-256 needs', () => {
    expect(userList({ user: 'protobase', password: 'secret' })).toBe('"protobase" "secret"\n')
  })
})
