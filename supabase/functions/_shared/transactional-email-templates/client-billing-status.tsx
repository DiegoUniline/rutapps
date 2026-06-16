import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
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
  nombre?: string
  empresa?: string
  monto?: string
  numUsuarios?: number
  fechaVigencia?: string
  fecha?: string
  invoiceUrl?: string
  enlacePago?: string
  intento?: number
  detalle?: string
}

const isFail = (e: string) => e === 'cobro_fallido'

const Email = ({
  evento,
  nombre,
  empresa,
  monto,
  numUsuarios,
  fechaVigencia,
  fecha,
  invoiceUrl,
  enlacePago,
  intento,
  detalle,
}: Props) => {
  const fail = isFail(evento)
  const titulo = fail ? 'No pudimos procesar tu pago' : '¡Gracias por tu pago!'
  const color = fail ? '#dc2626' : '#16a34a'
  const cta = fail ? (enlacePago || invoiceUrl) : invoiceUrl
  const ctaLabel = fail ? 'Reintentar pago' : 'Ver factura'
  const preview = fail
    ? `Pago pendiente${monto ? ` de ${monto}` : ''} — Rutapp`
    : `Pago confirmado${monto ? ` de ${monto}` : ''} — Rutapp`

  return (
    <Html lang="es">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={{ ...h1, color }}>{titulo}</Heading>
          <Text style={text}>
            {nombre ? `Hola ${nombre}` : 'Hola'}
            {empresa ? ` de ${empresa}` : ''},
          </Text>

          {fail ? (
            <Text style={text}>
              Intentamos cobrar tu suscripción de <b>Rutapp</b>
              {monto ? ` por ${monto}` : ''} y el cargo no fue aprobado por tu banco.
              {intento ? ` (Intento #${intento})` : ''}
            </Text>
          ) : (
            <Text style={text}>
              Confirmamos que recibimos tu pago de <b>Rutapp</b>. Tu suscripción está al día y todos tus usuarios tienen acceso completo.
            </Text>
          )}

          <Section style={card}>
            {monto ? <Row label="Monto" value={monto} bold /> : null}
            {numUsuarios ? <Row label="Usuarios" value={String(numUsuarios)} /> : null}
            {fecha ? <Row label="Fecha" value={fecha} /> : null}
            {fechaVigencia ? <Row label="Próximo cobro" value={fechaVigencia} /> : null}
            {fail && detalle ? <Row label="Motivo" value={detalle} /> : null}
          </Section>

          {cta ? (
            <Section style={{ textAlign: 'center', margin: '24px 0' }}>
              <Button href={cta} style={{ ...btn, backgroundColor: color }}>
                {ctaLabel}
              </Button>
            </Section>
          ) : null}

          {fail ? (
            <Text style={text}>
              Para evitar suspensión, actualiza tu método de pago o reintenta el cargo desde el enlace anterior.
              Si necesitas ayuda, responde a este correo.
            </Text>
          ) : (
            <Text style={text}>
              ¡Gracias por confiar en Rutapp! 🚀
            </Text>
          )}

          <Hr style={hr} />
          <Text style={footer}>Rutapp — Notificación automática de facturación.</Text>
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
    fecha: '16/06/2026',
    fechaVigencia: '16/07/2026',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '600px', margin: '0 auto' }
const h1 = { fontSize: '22px', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#374151', margin: '0 0 12px', lineHeight: '1.5' }
const card = {
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '16px',
  background: '#ffffff',
  margin: '16px 0',
}
const cellLabel = { fontSize: '13px', color: '#6b7280', padding: '6px 0', width: '40%' }
const cellValue = {
  fontSize: '14px',
  color: '#111827',
  padding: '6px 0',
  textAlign: 'right' as const,
  wordBreak: 'break-all' as const,
}
const btn = {
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
}
const hr = { borderColor: '#e5e7eb', margin: '24px 0 12px' }
const footer = { fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const }
