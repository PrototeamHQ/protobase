import { createContext, useContext } from 'react'

/** The resource whose record's file a viewer shows, so the viewer reads the file from the API that serves it. */
export const ViewedResourceContext = createContext<string | undefined>(undefined)

/** The resource of the file the viewer around it shows. */
export const useViewedResource = () => {
  const resource = useContext(ViewedResourceContext)
  if (resource === undefined) throw new Error('useViewedResource must be used inside a file viewer')
  return resource
}
