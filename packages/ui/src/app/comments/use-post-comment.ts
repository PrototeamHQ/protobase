import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useClient } from '../../data/api-provider'
import { keys } from '../../data/query-keys'

/** Posts a comment on the record, then loads its comments again so the new one shows. */
export const usePostComment = (resource: string, recordKey: string) => {
  const client = useClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { body: string; mentions: string[] }) => client.comment(resource, recordKey, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.comments(resource, recordKey) }),
  })
}
