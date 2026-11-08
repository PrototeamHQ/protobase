import { useQuery } from '@tanstack/react-query'
import { useClient } from '../../../data/api-provider'
import { keys } from '../../../data/query-keys'

/** The app's workflow trigger and step types, its plugins' included, as the server lists them for the editor. */
export const useWorkflowTypes = () => {
  const client = useClient()
  return useQuery({ queryKey: keys.workflowTypes, queryFn: () => client.workflowTypes() })
}
