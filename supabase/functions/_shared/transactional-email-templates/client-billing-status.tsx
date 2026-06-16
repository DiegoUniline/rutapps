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
  nombre?: string
  empresa?: string
  monto?: string
  numUsuarios?: number
  fechaVigencia?: string
  fecha?: string
  folio?: string
  payUrl?: string
  invoiceUrl?: string
  intento?: number
  detalle?: string
}

const LOGO = 'https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png'
const isFail = (e: string) => e === 'cobro_fallido'

const Email = ({
  evento,
  nombre,
  empresa,
  monto,
  numUsuarios,
  fechaVigencia,
  fecha,
  folio,
  payUrl,
  intento,
  detalle,
}: Props) => {
  const fail = isFail(evento)
  const accent = fail ? '#dc2626' : '#16a34a'
  const accentSoft = fail ? '#fef2f2' : '#f0fdf4'
  const titulo = fail ? '⚠️ No pudimos procesar tu pago' : '✅ ¡Gracias por tu pago!'
  const subtitulo = fail
    ? 'Tu cargo fue rechazado por el banco. Reintenta para mantener tu acceso activo.'
    : 'Tu suscripción de Rutapp está al día. ¡Gracias por confiar en nosotros! 🚀'

  return (
    <Html lang="es">
      <Head />
      <Preview>{fail ? `Pago pendiente${monto ? ` de ${monto}` : ''} — Rutapp` : `Pago confirmado${monto ? ` de ${monto}` : ''} — Rutapp`}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header */}
          <Section style={{ textAlign: 'center', padding: '12px 0 20px' }}>
            <Img src={LOGO} width="56" height="56" alt="Rutapp" style={{ borderRadius: '14px', margin: '0 auto' }} />
            <Text style={brand}>RUTAPP</Text>
          </Section>

          {/* Banner */}
          <Section style={{ ...banner, background: accentSoft, borderLeft: `4px solid ${accent}` }}>
            <Heading style={{ ...h1, color: accent }}>{titulo}</Heading>
            <Text style={bannerSub}>{subtitulo}</Text>
          </Section>

          {/* Greeting */}
          <Section style={{ padding: '20px 28px 4px' }}>
            <Text style={text}>
              Hola <b>{nombre || 'cliente'}</b>{empresa ? <> de <b>{empresa}</b></> : null},
            </Text>
            <Text style={text}>
              {fail ? (
                <>Intentamos cobrar tu suscripción de <b>Rutapp</b>{monto ? <> por <b>{monto}</b></> : null}{intento ? ` (Intento #${intento})` : ''} y el cargo no fue aprobado por tu banco.</>
              ) : (
                <>Recibimos tu pago correctamente. Tu suscripción está activa y todos tus usuarios tienen acceso completo.</>
              )}
            </Text>
          </Section>

          {/* Amount */}
          <Section style={amountWrap}>
            <Text style={amountLabel}>{fail ? 'Monto pendiente' : 'Monto pagado'}</Text>
            <Text style={{ ...amountValue, color: accent }}>{monto || '—'}</Text>
            {folio ? <Text style={folioText}>Folio: <strong>{folio}</strong></Text> : null}
          </Section>

          {/* CTA */}
          {payUrl ? (
            <Section style={{ textAlign: 'center', padding: '4px 0 24px' }}>
              <Button href={payUrl} style={{ ...btn, background: accent }}>
                {fail ? '💳 Reintentar pago' : '🧾 Ver factura'}
              </Button>
              <Text style={btnHint}>{payUrl.replace(/^https?:\/\//, '')}</Text>
            </Section>
          ) : null}

          {/* Details */}
          <Section style={card}>
            {numUsuarios ? <Row label="👥 Usuarios" value={String(numUsuarios)} /> : null}
            {fecha ? <Row label="📅 Fecha" value={fecha} /> : null}
            {fechaVigencia ? <Row label="🔁 Próximo cobro" value={fechaVigencia} /> : null}
            {fail && detalle ? <Row label="ℹ️ Motivo" value={detalle} /> : null}
          </Section>

          <Section style={{ padding: '0 28px 12px' }}>
            <Text style={text}>
              {fail
                ? 'Para evitar la suspensión de tu cuenta, actualiza tu método de pago o reintenta el cargo desde el botón de arriba. Si necesitas ayuda, responde a este correo.'
                : '¡Seguimos trabajando para que tu operación nunca se detenga! 💪'}
            </Text>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>
            Rutapp.mx · Notificación automática de facturación<br />
            Si tienes dudas, responde a este correo y te ayudamos.
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
    isFail(d.evento)
      ? `⚠️ Pago pendiente${d.monto ? ` de ${d.monto}` : ''} — Rutapp`
      : `✅ Pago confirmado${d.monto ? ` de ${d.monto}` : ''} — Rutapp`,
  displayName: 'Notificación de cobro al cliente',
  previewData: {
    evento: 'cobro_exitoso',
    nombre: 'Juan',
    empresa: 'Empresa Demo',
    monto: '$2,700 MXN',
    numUsuarios: 3,
    folio: 'RUT-0001',
    payUrl: 'https://rutapp.mx/factura/RUT-0001',
    fecha: '16/06/2026',
    fechaVigencia: '16/07/2026',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#f4f6f9', fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif', padding: '24px 0' }
const container = { padding: '0', maxWidth: '600px', margin: '0 auto', background: '#ffffff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }
const brand = { fontSize: '11px', letterSpacing: '2px', color: '#6b7280', fontWeight: 700, marginTop: '10px' }
const banner = { padding: '20px 28px', margin: '0 28px', borderRadius: '8px' }
const bannerSub = { fontSize: '14px', color: '#374151', margin: '6px 0 0', lineHeight: 1.5 }
const h1 = { fontSize: '22px', margin: 0, fontWeight: 700 }
const text = { fontSize: '14px', color: '#374151', margin: '0 0 12px', lineHeight: 1.6 }
const amountWrap = { textAlign: 'center' as const, padding: '20px 24px 12px' }
const amountLabel = { fontSize: '12px', color: '#6b7280', textTransform: 'uppercase' as const, letterSpacing: '1px', margin: 0 }
const amountValue = { fontSize: '36px', fontWeight: 800, margin: '6px 0 4px', lineHeight: 1.1 }
const folioText = { fontSize: '13px', color: '#6b7280', margin: 0 }
const btn = { color: '#ffffff', padding: '14px 32px', borderRadius: '10px', fontSize: '15px', fontWeight: 700, textDecoration: 'none', display: 'inline-block' }
const btnHint = { fontSize: '12px', color: '#6b7280', margin: '10px 0 0' }
const card = { border: '1px solid #e5e7eb', borderRadius: '10px', padding: '8px 16px', background: '#fafafa', margin: '0 28px 20px' }
const cellLabel = { fontSize: '13px', color: '#6b7280', padding: '8px 0', width: '40%' }
const cellValue = { fontSize: '14px', color: '#111827', padding: '8px 0', textAlign: 'right' as const, wordBreak: 'break-word' as const, fontWeight: 500 }
const hr = { borderColor: '#e5e7eb', margin: '4px 28px' }
const footer = { fontSize: '11px', color: '#9ca3af', margin: '0', padding: '14px 28px 24px', textAlign: 'center' as const, lineHeight: 1.6 }
