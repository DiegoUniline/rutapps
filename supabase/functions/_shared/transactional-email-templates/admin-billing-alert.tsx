import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  evento: 'cobro_exitoso' | 'cobro_fallido' | string
  empresa?: string
  clienteNombre?: string
  clienteEmail?: string
  clienteTelefono?: string
  monto?: string
  numUsuarios?: number
  invoiceUrl?: string
  fecha?: string
  detalle?: string
}

const isFail = (e: string) => e === 'cobro_fallido'

const Email = ({
  evento,
  empresa,
  clienteNombre,
  clienteEmail,
  clienteTelefono,
  monto,
  numUsuarios,
  invoiceUrl,
  fecha,
  detalle,
}: Props) => {
  const fail = isFail(evento)
  const titulo = fail ? '⚠️ Cobro fallido' : '✅ Cobro exitoso'
  const color = fail ? '#dc2626' : '#16a34a'
  return (
    <Html lang="es">
      <Head />
      <Preview>{`${titulo} — ${empresa || 'Cliente'} — ${monto || ''}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={{ ...h1, color }}>{titulo}</Heading>
          <Text style={text}>Notificación interna de billing — Rutapp</Text>

          <Section style={card}>
            <Row label="Empresa" value={empresa || '—'} />
            <Row label="Cliente" value={clienteNombre || '—'} />
            <Row label="Email" value={clienteEmail || '—'} />
            <Row label="Teléfono" value={clienteTelefono || '—'} />
            <Hr style={hr} />
            <Row label="Monto" value={monto || '—'} bold />
            {numUsuarios ? <Row label="Usuarios" value={String(numUsuarios)} /> : null}
            {fecha ? <Row label="Fecha" value={fecha} /> : null}
            {invoiceUrl ? <Row label="Factura Stripe" value={invoiceUrl} /> : null}
            {detalle ? <Row label="Detalle" value={detalle} /> : null}
          </Section>

          <Text style={footer}>
            Copia administrativa automática. No responder.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const Row = ({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) => (
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <tbody>
      <tr>
        <td style={cellLabel}>{label}</td>
        <td style={{ ...cellValue, fontWeight: bold ? 700 : 400 }}>{value}</td>
      </tr>
    </tbody>
  </table>
)

export const template = {
  component: Email,
  subject: (d: Props) =>
    `${isFail(d.evento) ? '⚠️ Cobro fallido' : '✅ Cobro exitoso'} — ${d.empresa || 'Cliente'} — ${d.monto || ''}`,
  displayName: 'Admin Billing Alert',
  previewData: {
    evento: 'cobro_exitoso',
    empresa: 'Empresa Demo',
    clienteNombre: 'Juan Pérez',
    clienteEmail: 'juan@demo.com',
    clienteTelefono: '+521234567890',
    monto: '$2,700 MXN',
    numUsuarios: 3,
    fecha: '16/06/2026',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto' }
const h1 = { fontSize: '22px', margin: '0 0 8px' }
const text = { fontSize: '14px', color: '#374151', margin: '0 0 16px' }
const card = {
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px',
  background: '#ffffff',
}
const cellLabel = {
  fontSize: '13px',
  color: '#6b7280',
  padding: '6px 0',
  width: '40%',
}
const cellValue = {
  fontSize: '14px',
  color: '#111827',
  padding: '6px 0',
  textAlign: 'right' as const,
  wordBreak: 'break-all' as const,
}
const hr = { borderColor: '#e5e7eb', margin: '8px 0' }
const footer = {
  fontSize: '12px',
  color: '#9ca3af',
  marginTop: '16px',
  textAlign: 'center' as const,
}
