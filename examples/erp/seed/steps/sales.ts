import type { Db } from '../../db/connection'
import { invoiceFor } from '../builders/invoice'
import { orderAt } from '../builders/order'
import { copyRows } from '../copy'
import { iso, isoDate, money, row } from '../format'
import type { World } from '../world'

function* orderRows(world: World) {
  for (const org of world.orgs) {
    for (let ordinal = 0; ordinal < org.orderCount; ordinal++) {
      const order = orderAt(org, ordinal)
      yield row(order.id, org.id, order.number, order.company.id, order.personId, order.ownerId, order.status, 'EUR', money(order.discount * 100), money(order.totalCents), order.paid, order.notes, iso(order.createdAt), iso(order.updatedAt))
    }
  }
}

function* orderLineRows(world: World) {
  for (const org of world.orgs) {
    for (let ordinal = 0; ordinal < org.orderCount; ordinal++) {
      const order = orderAt(org, ordinal)
      for (const line of order.lines) {
        yield row(order.id, line.lineNo, org.id, line.productId, line.description, line.quantity, money(line.unitPriceCents), iso(order.createdAt), iso(order.createdAt))
      }
    }
  }
}

function* invoiceRows(world: World) {
  for (const org of world.orgs) {
    for (let ordinal = 0; ordinal < org.orderCount; ordinal++) {
      const order = orderAt(org, ordinal)
      const invoice = invoiceFor(org, ordinal, order)
      if (!invoice) continue
      yield row(invoice.id, org.id, invoice.number, order.id, order.company.id, invoice.status, isoDate(invoice.issuedAt), isoDate(invoice.dueAt), money(invoice.vatRate * 100), money(invoice.subtotalCents), money(invoice.vatCents), money(invoice.totalCents), iso(invoice.createdAt), iso(invoice.updatedAt))
    }
  }
}

// Line ids leave room for nine positions per invoice; invoice lines mirror the order lines.
function* invoiceLineRows(world: World) {
  for (const org of world.orgs) {
    for (let ordinal = 0; ordinal < org.orderCount; ordinal++) {
      const order = orderAt(org, ordinal)
      const invoice = invoiceFor(org, ordinal, order)
      if (!invoice) continue
      for (const line of order.lines) {
        yield row((invoice.id - 1) * 10 + line.lineNo, invoice.id, org.id, line.lineNo, line.productId, line.description, line.quantity, money(line.unitPriceCents), iso(invoice.createdAt), iso(invoice.createdAt))
      }
    }
  }
}

export const seedSales = async (sql: Db, world: World) => {
  await copyRows(sql, 'sales.orders (id, organization_id, number, company_id, person_id, owner_id, status, currency_code, discount_percent, total, paid, notes, created_at, updated_at)', orderRows(world))
  await copyRows(sql, 'sales.order_lines (order_id, line_no, organization_id, product_id, description, quantity, unit_price, created_at, updated_at)', orderLineRows(world))
  await copyRows(sql, 'sales.invoices (id, organization_id, number, order_id, company_id, status, issued_at, due_at, vat_rate, subtotal, vat, total, created_at, updated_at)', invoiceRows(world))
  await copyRows(sql, 'sales.invoice_lines (id, invoice_id, organization_id, position, product_id, description, quantity, unit_price, created_at, updated_at)', invoiceLineRows(world))
}
