import { definePdf } from '@protobase/server'
import { Document, Page, StyleSheet, Text, View } from '@protobase/server/pdf'

export type InvoiceDocumentData = { number: string; company: string; issuedAt: string; dueAt: string; total: string }

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11 },
  heading: { fontSize: 20, marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
})

const InvoiceDocument = ({ number, company, issuedAt, dueAt, total }: InvoiceDocumentData) => (
  <Document title={`Invoice ${number}`}>
    <Page size="A4" style={styles.page}>
      <Text style={styles.heading}>Invoice {number}</Text>
      <Text>{company}</Text>
      <View style={styles.row}>
        <Text>Issued</Text>
        <Text>{issuedAt}</Text>
      </View>
      <View style={styles.row}>
        <Text>Due</Text>
        <Text>{dueAt}</Text>
      </View>
      <View style={styles.row}>
        <Text>Total</Text>
        <Text>{total}</Text>
      </View>
    </Page>
  </Document>
)

export const invoiceDocument = definePdf({ name: 'invoice', component: InvoiceDocument })
