import { definePdf } from '@protobase/server'
import { Document, Page, StyleSheet, Text, View } from '@protobase/server/pdf'

export type RepairQuote = { number: string; customer: string; bike: string; problem: string; estimate: string }

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: 'Helvetica' },
  heading: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', borderBottom: '1pt solid #e4e4e7', paddingVertical: 6 },
})

// The document's data is the component's props: `render` takes exactly these.
const RepairQuoteDocument = ({ number, customer, bike, problem, estimate }: RepairQuote) => (
  <Document title={`Quote ${number}`}>
    <Page size="A4" style={styles.page}>
      <Text style={styles.heading}>Quote {number}</Text>
      <Text>For {customer}</Text>
      <View style={styles.row}>
        <Text>
          {bike}: {problem}
        </Text>
        <Text>{estimate}</Text>
      </View>
    </Page>
  </Document>
)

export const repairQuote = definePdf({ name: 'repair-quote', component: RepairQuoteDocument })
