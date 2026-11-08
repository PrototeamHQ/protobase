import { describe, expect, it } from 'vitest'
import { s3EnvironmentProblem, s3EnvironmentVariables } from './s3-environment'

describe('s3EnvironmentProblem', () => {
  it('names each endpoint, region or session-token variable the S3 client would read', () => {
    for (const name of s3EnvironmentVariables) expect(s3EnvironmentProblem({ PATH: '/bin', [name]: 'x' })).toBe(name)
  })

  it('takes an environment without them, or with them empty', () => {
    expect(s3EnvironmentProblem({ PATH: '/bin', AWS_ACCESS_KEY_ID: 'x', S3_BUCKET: 'b' })).toBeUndefined()
    expect(s3EnvironmentProblem({ AWS_REGION: '' })).toBeUndefined()
  })
})
