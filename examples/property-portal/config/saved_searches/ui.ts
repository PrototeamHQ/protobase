import { l, view } from '@protobase/schema'
import type { savedSearches } from './data'

/**
 * A member's saved searches: the list page shows each with its filters, its email setting and the listings published
 * since they last opened its results, in a row of the listings' cards. A visitor is told what signing in gives there and
 * by "Save search" on the listings.
 */
export const savedSearchesView = view<typeof savedSearches>('saved_searches')
  .title((r) => r.name)
  .names({ singular: 'Search', plural: 'Searches' })
  .nav({ group: 'Yours', order: 2 })
  .help('The searches you saved from the listings, with the homes published since you last looked. Save one with "Save search" on the filtered listings.')
  .fields((r) => ({
    filter: r.filter.help('The listings page\'s filter, as its address has it.'),
    alert_frequency: r.alert_frequency.label('Email').format('badge').valueLabels({ instant: 'At once', daily: 'Daily digest', none: 'No email' }),
    seen_at: r.seen_at.label('Last looked').help('Listings published after this are new to you. Opening all results moves it to now.'),
    created_at: r.created_at.label('Saved'),
  }))
  .list((r) => ({ columns: [r.name, r.alert_frequency, r.seen_at, r.created_at], sort: [[r.created_at, 'desc']], search: [r.name] }))
  .searchesOf((r) => ({ resource: 'listings', filter: r.filter, name: r.name, controls: [r.alert_frequency], unseen: { seenAt: r.seen_at, field: 'published_at' } }))
  .signIn({
    title: 'Hear of new homes first',
    description: 'Sign in to save a search of the listings and get the new homes that fit it by email.',
    benefits: ['Save the filters you set with "Save search"', 'See the homes published since you last looked', 'Get them by email at once, or in a morning digest'],
    icon: 'bookmark',
  })
  .layout((r) => [
    l.section('Search', [r.name, r.filter, r.alert_frequency]),
    l.sidebar([r.alert_frequency, r.seen_at, r.created_at]),
    l.related('Alerts', { resource: 'alerts', field: 'saved_search_id', sort: 'matched_at desc', columns: ['listing_id', 'matched_at', 'emailed_at'], empty: 'No listing has fit yet.' }),
  ])
