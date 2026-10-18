import { useMemo } from 'react'
import { readFormAddress } from '@protobase/schema'
import { useRouter } from '../app/router'

/** The public form the address shows, `/-/forms/<name>`, as logical values; `undefined` on any other page. */
export const useFormAddress = () => {
  const { path } = useRouter()
  return useMemo(() => readFormAddress(path), [path])
}
