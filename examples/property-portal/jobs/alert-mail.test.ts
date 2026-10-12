import { describe, expect, it } from 'vitest'
import { alertMail, type MailedAlert } from './alert-mail'

const flat: MailedAlert = { listing_id: '42', address: 'Keizersgracht 123-2', place: 'Amsterdam', offer_type: 'sale', price: '650000.00', living_area: 92, profile: 'Canal flat' }
const piso: MailedAlert = { listing_id: '7', address: 'Calle de Serrano, 45', place: 'Madrid', offer_type: 'rent', price: '2100.00', living_area: 80, profile: 'Madrid centro' }

describe('alertMail', () => {
  it('names the one listing of an instant alert, with its price, size, profile and link', () => {
    const mail = alertMail('anna@example.com', 'instant', [flat], 'https://portal.example.com')
    expect(mail).toMatchObject({ to: 'anna@example.com', subject: 'New: Keizersgracht 123-2, Amsterdam' })
    expect(mail.text).toContain('For sale: €650,000, 92 m²')
    expect(mail.text).toContain('Fits "Canal flat"')
    expect(mail.text).toContain('https://portal.example.com/listings/42')
  })

  it('counts the listings of a digest, and gives a rent per month', () => {
    const mail = alertMail('bram@example.com', 'daily', [flat, piso], 'http://localhost:5173')
    expect(mail.subject).toBe('2 new homes fit your searches')
    expect(mail.text).toContain('For rent: €2,100 a month, 80 m²')
    expect(alertMail('bram@example.com', 'daily', [piso], '').subject).toBe('1 new home fits your searches')
  })
})
