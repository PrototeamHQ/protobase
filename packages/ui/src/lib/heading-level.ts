import { createContext, useContext } from 'react'

/** The level of the heading the content sits under, such as 2 in a record page section; 0 where none is. */
export const HeadingLevel = createContext(0)

export const useHeadingLevel = () => useContext(HeadingLevel)
