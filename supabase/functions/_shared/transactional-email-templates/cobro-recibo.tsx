/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  clienteNombre?: string
  empresaNombre?: string
  monto?: string
  fecha?: string
  metodoPago?: string
  referencia?: string
  folios?: string
  saldoActual?: string
  portalUrl?: string
  pdfUrl?: string
}

const Email = ({
  clienteNombre = 'Cliente',
  empresaNombre = 'Rutapp',
  monto = '$0.00',
  fecha = '',
  metodoPago = '',
  referencia = '',
  folios = '',
  saldoActual = '$0.00',
  portalUrl = 'https://rutapp.mx',
  pdfUrl = '',
}: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Recibo de pago por {monto} — {empresaNombre}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Heading style={h1}>{empresaNombre}</Heading>
          <Text style={subtitle}>Comprobante de pago</Text>
        </Section>

        <Section style={content}>
          <Text style={greeting}>Hola {clienteNombre},</Text>
          <Text style={paragraph}>
            Recibimos tu pago. Te compartimos los detalles:
          </Text>

          <Section style={amountBox}>
            <Text style={amountLabel}>Monto recibido</Text>
            <Text style={amountValue}>{monto}</Text>
          </Section>

          <Section style={detailsBox}>
            <DetailRow label="Fecha" value={fecha} />
            {metodoPago ? <DetailRow label="Método de pago" value={metodoPago} /> : null}
            {referencia ? <DetailRow label="Referencia" value={referencia} /> : null}
            {folios ? <DetailRow label="Aplicado a" value={folios} /> : null}
            <DetailRow label="Saldo actual" value={saldoActual} bold />
          </Section>

          <Section style={{ textAlign: 'center' as const, padding: '24px 0 8px' }}>
            <Button href={portalUrl} style={button}>
              Ver mi estado de cuenta
            </Button>
          </Section>

          {pdfUrl ? (
            <Text style={{ textAlign: 'center' as const, fontSize: '13px', color: '#6b7280' }}>
              <Link href={pdfUrl} style={link}>Descargar recibo en PDF</Link>
            </Text>
          ) : null}

          <Hr style={hr} />
          <Text style={footer}>
            Si tienes alguna duda sobre este pago, responde a este correo o contacta directamente con {empresaNombre}.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

const DetailRow = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse' as const }}>
    <tbody>
      <tr>
        <td style={{ padding: '6px 0', fontSize: '13px', color: '#6b7280' }}>{label}</td>
        <td style={{ padding: '6px 0', fontSize: '14px', color: '#111827', textAlign: 'right' as const, fontWeight: bold ? 700 : 500 }}>{value}</td>
      </tr>
    </tbody>
  </table>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Recibo de pago por ${d?.monto ?? ''} — ${d?.empresaNombre ?? 'Rutapp'}`,
  displayName: 'Recibo de cobro',
  previewData: {
    clienteNombre: 'Juan Pérez',
    empresaNombre: 'Mi Empresa',
    monto: '$1,250.00',
    fecha: '11/06/2026',
    metodoPago: 'Efectivo',
    referencia: '',
    folios: 'V-00123',
    saldoActual: '$0.00',
    portalUrl: 'https://rutapp.mx/cliente/demo',
    pdfUrl: 'https://rutapp.mx/recibo.pdf',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' }
const container = { maxWidth: '600px', margin: '0 auto', padding: '0' }
const header = { padding: '32px 32px 16px', borderBottom: '1px solid #e5e7eb' }
const h1 = { margin: 0, fontSize: '22px', fontWeight: 700, color: '#1a1a1a' }
const subtitle = { margin: '4px 0 0', fontSize: '13px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '1px' }
const content = { padding: '24px 32px 32px' }
const greeting = { fontSize: '15px', color: '#111827', margin: '0 0 8px' }
const paragraph = { fontSize: '14px', color: '#374151', margin: '0 0 20px' }
const amountBox = { background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '20px', textAlign: 'center' as const, margin: '0 0 16px' }
const amountLabel = { fontSize: '12px', color: '#075985', textTransform: 'uppercase' as const, letterSpacing: '1px', margin: 0 }
const amountValue = { fontSize: '28px', fontWeight: 700, color: '#0c4a6e', margin: '4px 0 0' }
const detailsBox = { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px 16px' }
const button = { background: 'hsl(221, 83%, 53%)', color: '#ffffff', padding: '12px 28px', borderRadius: '6px', textDecoration: 'none', fontSize: '14px', fontWeight: 600, display: 'inline-block' }
const link = { color: 'hsl(221, 83%, 53%)', textDecoration: 'underline' }
const hr = { borderColor: '#e5e7eb', margin: '24px 0 16px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: 0 }
