import { describe, expect, it } from 'vitest'
import type { AlertedListing } from './alerted-listing'
import { prices } from './alerted-listing'
import { dailyDigest } from './daily-digest'
import { instantAlert } from './instant-alert'

const flat: AlertedListing = { address: 'Keizersgracht 123-2', place: 'Amsterdam', purchasePrice: '650000.00', rentPrice: null, livingArea: 92, search: 'Canal flat', url: 'https://portal.example.com/listings/42' }
const piso: AlertedListing = { address: 'Calle de Serrano, 45', place: 'Madrid', purchasePrice: null, rentPrice: '2100.00', livingArea: 80, search: 'Madrid centro', url: 'https://portal.example.com/listings/7' }
const searchesUrl = 'https://portal.example.com/saved_searches'

describe('the instant alert', () => {
  it('names the one listing, with its price, size, search and link', async () => {
    const email = await instantAlert.render({ listings: [flat], searchesUrl })
    expect(email.subject).toBe('New: Keizersgracht 123-2, Amsterdam')
    expect(email.html).toContain('href="https://portal.example.com/listings/42"')
    expect(email.text).toContain('For sale: €650,000, 92 m²')
    expect(email.text).toContain('Fits "Canal flat"')
    expect(email.text).toContain(searchesUrl)
  })

  it('counts the listings when several came at once', async () => {
    expect((await instantAlert.render({ listings: [flat, piso], searchesUrl })).subject).toBe('2 new homes fit your searches')
  })
})

describe('the daily digest', () => {
  it('counts the listings of the day, and gives a rent per month', async () => {
    const email = await dailyDigest.render({ listings: [flat, piso], searchesUrl })
    expect(email.subject).toBe('2 new homes fit your searches')
    expect(email.text).toContain('These homes were published since your last digest')
    expect(email.text).toContain('For rent: €2,100 a month, 80 m²')
    expect((await dailyDigest.render({ listings: [piso], searchesUrl })).subject).toBe('1 new home fits your searches')
  })
})

describe('prices', () => {
  it('gives both prices of a home offered both ways', () => {
    expect(prices({ purchasePrice: '650000.00', rentPrice: '2450.00' })).toBe('For sale: €650,000 or for rent: €2,450 a month')
  })
})
