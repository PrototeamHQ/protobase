import { expect, it } from 'vitest'
import { memberIdsOf, memberOptions, toggledId } from './member-ids'

const people = [
  { id: 'u-bo', name: 'Bo Jansen' },
  { id: 'u-sanne', name: 'Sanne de Vries' },
  { id: 'u-jan', name: 'Jan Smit' },
]

it('reads the user ids of an array, and none from a value that is no array', () => {
  expect(memberIdsOf(['u-bo', 'u-jan'])).toEqual(['u-bo', 'u-jan'])
  expect(memberIdsOf(['u-bo', 7, null])).toEqual(['u-bo'])
  expect(memberIdsOf(null)).toEqual([])
  expect(memberIdsOf('u-bo')).toEqual([])
})

it('adds an id it lacks and takes off one it holds', () => {
  expect(toggledId(['u-bo'], 'u-jan')).toEqual(['u-bo', 'u-jan'])
  expect(toggledId(['u-bo', 'u-jan'], 'u-bo')).toEqual(['u-jan'])
})

it('offers the members whose name holds every word typed, by user id', () => {
  expect(memberOptions(people, '')).toHaveLength(3)
  expect(memberOptions(people, 'jan')).toEqual([
    { key: 'u-bo', label: 'Bo Jansen' },
    { key: 'u-jan', label: 'Jan Smit' },
  ])
  expect(memberOptions(people, 'de sanne')).toEqual([{ key: 'u-sanne', label: 'Sanne de Vries' }])
})
