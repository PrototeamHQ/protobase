import { useMemo } from 'react'
import { readConnectAddress } from '@protobase/schema'
import { useRouter } from '../app/router'

/** The connect page's address as logical values: the signed authorization request, when its query holds one. */
export const useConnectAddress = () => {
  const { params } = useRouter()
  return useMemo(() => readConnectAddress(params.toString()), [params])
}
