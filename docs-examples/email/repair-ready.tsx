import { defineEmail } from '@protobase/server'
import { Body, Button, Container, Head, Heading, Html, Preview, Text } from 'react-email'

export type RepairReady = { customer: string; bike: string; number: string; url: string }

// The email's data is the component's props: `send` and `render` take exactly these.
const RepairReadyEmail = ({ customer, bike, number, url }: RepairReady) => (
  <Html lang="en">
    <Head />
    <Preview>Your {bike} is ready for pickup</Preview>
    <Body style={{ backgroundColor: '#f4f4f5', fontFamily: 'Helvetica, Arial, sans-serif' }}>
      <Container style={{ backgroundColor: '#ffffff', padding: '24px', maxWidth: '480px' }}>
        <Heading as="h1">Ready for pickup</Heading>
        <Text>Hi {customer}, your {bike} is ready. Bring repair number {number} when you come by.</Text>
        <Button href={url} style={{ backgroundColor: '#0f766e', color: '#ffffff', padding: '12px 20px', borderRadius: '6px' }}>
          See the repair
        </Button>
      </Container>
    </Body>
  </Html>
)

export const repairReady = defineEmail({
  name: 'repair-ready',
  subject: ({ bike }: RepairReady) => `Your ${bike} is ready for pickup`,
  component: RepairReadyEmail,
})
