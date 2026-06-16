import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
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
  folio?: string
  payUrl?: string
  invoiceUrl?: string
  fecha?: string
  intento?: number
  detalle?: string
}

const LOGO = 'https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png'

const isFail = (e: string) => e === 'cobro_fallido'

const Email = ({
  evento,
  empresa,
  clienteNombre,
  clienteEmail,
  clienteTelefono,
  monto,
  numUsuarios,
  folio,
  payUrl,
  fecha,
  intento,
  detalle,
}: Props) => {
  const fail = isFail(evento)
  const accent = fail ? '#dc2626' : '#16a34a'
  const accentSoft = fail ? '#fef2f2' : '#f0fdf4'
  const headline = fail ? '⚠️ Cobro fallido' : '✅ Cobro exitoso'
  const subline = fail
    ? 'No se pudo procesar el pago de este cliente.'
    : '¡Se procesó correctamente el pago del cliente!'

  return (
    <Html lang="es">
      <Head />
      <Preview>{`${headline} — ${empresa || 'Cliente'} — ${monto || ''}`}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={{ textAlign: 'center', padding: '8px 0 24px' }}>
            <Img src={LOGO} width="56" height="56" alt="Rutapp" style={{ borderRadius: '14px', margin: '0 auto' }} />
            <Text style={brand}>RUTAPP · BILLING</Text>
          </Section>

          {/* Status banner */}
          <Section style={{ ...banner, background: accentSoft, borderLeft: `4px solid ${accent}` }}>
            <Heading style={{ ...h1, color: accent }}>{headline}</Heading>
            <Text style={bannerSub}>{subline}</Text>
          </Section>

          {/* Amount */}
          <Section style={amountWrap}>
            <Text style={amountLabel}>Monto</Text>
            <Text style={{ ...amountValue, color: accent }}>{monto || '—'}</Text>
            {folio ? <Text style={folioText}>Folio: <strong>{folio}</strong></Text> : null}
          </Section>

          {/* CTA */}
          {payUrl ? (
            <Section style={{ textAlign: 'center', padding: '8px 0 24px' }}>
              <Button href={payUrl} style={{ ...btn, background: accent }}>
                {fail ? '💳 Reintentar pago' : '🧾 Ver factura'}
              </Button>
              <Text style={btnHint}>{payUrl.replace(/^https?:\/\//, '')}</Text>
            </Section>
          ) : null}

          {/* Details card */}
          <Section style={card}>
            <Row label="🏢 Empresa" value={empresa || '—'} />
            <Row label="👤 Cliente" value={clienteNombre || '—'} />
            <Row label="✉️ Email" value={clienteEmail || '—'} />
            <Row label="📱 Teléfono" value={clienteTelefono || '—'} />
            <Hr style={hr} />
            {numUsuarios ? <Row label="👥 Usuarios" value={String(numUsuarios)} /> : null}
            {fecha ? <Row label="📅 Fecha" value={fecha} /> : null}
            {intento ? <Row label="🔁 Intento" value={`#${intento}`} /> : null}
            {detalle ? <Row label="ℹ️ Detalle" value={detalle} /> : null}
          </Section>

          <Text style={footer}>
            Copia administrativa automática · Rutapp.mx<br />
            No responder a este correo.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <tbody>
      <tr>
        <td style={cellLabel}>{label}</td>
        <td style={cellValue}>{value}</td>
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
    folio: 'RUT-0001',
    payUrl: 'https://rutapp.mx/factura/RUT-0001',
    fecha: '16/06/2026',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#f4f6f9', fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif', padding: '24px 0' }
const container = { padding: '0', maxWidth: '600px', margin: '0 auto', background: '#ffffff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }
const brand = { fontSize: '11px', letterSpacing: '2px', color: '#6b7280', fontWeight: 700, marginTop: '10px' }
const banner = { padding: '20px 28px', margin: '0 28px', borderRadius: '8px' }
const bannerSub = { fontSize: '14px', color: '#374151', margin: '4px 0 0' }
const h1 = { fontSize: '22px', margin: 0, fontWeight: 700 }
const amountWrap = { textAlign: 'center' as const, padding: '28px 24px 16px' }
const amountLabel = { fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '1px', margin: 0 }
const amountValue = { fontSize: '36px', fontWeight: 800, margin: '6px 0 4px', lineHeight: 1.1 }
const folioText = { fontSize: '13px', color: '#6b7280', margin: 0 }
const btn = { color: '#ffffff', padding: '14px 32px', borderRadius: '10px', fontSize: '15px', fontWeight: 700, textDecoration: 'none', display: 'inline-block' }
const btnHint = { fontSize: '12px', color: '#6b7280', margin: '10px 0 0' }
const card = { border: '1px solid #e5e7eb', borderRadius: '10px', padding: '8px 16px', background: '#fafafa', margin: '8px 28px 24px' }
const cellLabel = { fontSize: '13px', color: '#6b7280', padding: '8px 0', width: '40%' }
const cellValue = { fontSize: '14px', color: '#111827', padding: '8px 0', textAlign: 'right' as const, wordBreak: 'break-word' as const, fontWeight: 500 }
const hr = { borderColor: '#e5e7eb', margin: '4px 0' }
const footer = { fontSize: '11px', color: '#9ca3af', margin: '0', padding: '20px 28px 24px', textAlign: 'center' as const, lineHeight: 1.6 }
