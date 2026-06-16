import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
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
  metodoPago?: string
}

const LOGO = 'https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png'
const PRIMARY = '#1554F0'
const SUCCESS = '#16a34a'
const DANGER = '#dc2626'
const TEXT_DARK = '#0f172a'
const TEXT_MUTED = '#64748b'
const BORDER = '#e2e8f0'

const isFail = (e: string) => e === 'cobro_fallido'

const Email = ({
  evento,
  monto,
  fecha,
  folio,
  payUrl,
  invoiceUrl,
  detalle,
  metodoPago,
}: Props) => {
  const fail = isFail(evento)
  const accent = fail ? DANGER : SUCCESS
  const accentSoft = fail ? '#fee2e2' : '#dcfce7'
  const titulo = fail ? 'No pudimos procesar tu pago' : 'Pago recibido correctamente'
  const subtitulo = fail
    ? 'Intentamos renovar tu suscripción, pero tu banco rechazó el cargo. Tu información y acceso permanecen seguros.'
    : 'Tu suscripción fue renovada exitosamente. Gracias por seguir utilizando RutApp.'
  const pillText = fail ? 'Pago pendiente' : 'Pago completado'
  const pillNote = fail
    ? 'Reintentaremos automáticamente en las próximas 24 horas.'
    : 'Tu cuenta se encuentra activa.'
  const primaryLabel = fail ? 'Actualizar método de pago' : 'Ver factura'
  const secondaryLabel = fail ? 'Reintentar ahora' : 'Ir al sistema'
  const primaryUrl = fail ? (payUrl || 'https://rutapp.mx/facturacion') : (invoiceUrl || payUrl || 'https://rutapp.mx/facturacion')
  const secondaryUrl = fail ? (payUrl || 'https://rutapp.mx/facturacion') : 'https://rutapp.mx'

  return (
    <Html lang="es">
      <Head />
      <Preview>{fail ? `Pago pendiente${monto ? ` de ${monto}` : ''} — RutApp` : `Pago confirmado${monto ? ` de ${monto}` : ''} — RutApp`}</Preview>
      <Body style={main}>
        <Container style={card}>
          {/* Logo */}
          <Section style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <Img src={LOGO} width="56" height="56" alt="RutApp" style={{ margin: '0 auto', borderRadius: '12px' }} />
            <Text style={brand}>RUTAPP</Text>
          </Section>

          {/* Big status icon */}
          <Section style={{ textAlign: 'center', padding: '8px 0 0' }}>
            <table style={{ margin: '0 auto', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td
                    style={{
                      width: '88px',
                      height: '88px',
                      background: accentSoft,
                      borderRadius: '50%',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      fontSize: '44px',
                      lineHeight: '88px',
                      color: accent,
                    }}
                  >
                    {fail ? '✕' : '✓'}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Title + subtitle */}
          <Section style={{ textAlign: 'center', padding: '20px 32px 0' }}>
            <Heading style={h1}>{titulo}</Heading>
            <Text style={subtitle}>{subtitulo}</Text>
          </Section>

          {/* Data card */}
          <Section style={dataCard}>
            <DataRow color={accent} icon="📅" label={fail ? 'Fecha del intento' : 'Fecha'} value={fecha || '—'} />
            {metodoPago ? <DataRow color={accent} icon="💳" label="Método de pago" value={metodoPago} /> : null}
            <DataRow color={accent} icon="$" label={fail ? 'Monto' : 'Importe'} value={monto || '—'} bold />
            {folio ? <DataRow color={accent} icon="📄" label="Folio" value={folio} /> : null}
            {fail && detalle ? <DataRow color={accent} icon="ℹ️" label="Motivo" value={detalle} /> : null}
          </Section>

          {/* Status pill */}
          <Section style={{ textAlign: 'center', padding: '4px 0 0' }}>
            <table style={{ margin: '0 auto', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ ...pill, background: accentSoft, color: accent }}>
                    <span style={{ color: accent }}>●</span>&nbsp;&nbsp;{pillText}
                  </td>
                </tr>
              </tbody>
            </table>
            <Text style={pillSub}>{pillNote}</Text>
          </Section>

          {/* CTAs */}
          <Section style={{ textAlign: 'center', padding: '4px 32px 24px' }}>
            <Button href={primaryUrl} style={btnPrimary}>{primaryLabel}</Button>
            <div style={{ height: '12px' }} />
            <Button href={secondaryUrl} style={btnSecondary}>{secondaryLabel}</Button>
          </Section>

          {/* Footer */}
          <Section style={footerWrap}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td style={{ width: '50%', verticalAlign: 'top' }}>
                    <Text style={footerTitle}>🎧 ¿Necesitas ayuda?</Text>
                    <Text style={footerSub}>Estamos para ayudarte</Text>
                  </td>
                  <td style={{ width: '50%', verticalAlign: 'top', textAlign: 'right' as const }}>
                    <Text style={footerLine}>✉️ soporte@rutapp.mx</Text>
                    <Text style={footerLine}>📱 317 128 8029</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const DataRow = ({ color, icon, label, value, bold }: { color: string; icon: string; label: string; value: string; bold?: boolean }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <tbody>
      <tr>
        <td style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ width: '28px', color, fontSize: '16px', verticalAlign: 'middle' }}>{icon}</td>
                <td style={{ fontSize: '14px', color: TEXT_MUTED, verticalAlign: 'middle' }}>{label}</td>
              </tr>
            </tbody>
          </table>
        </td>
        <td style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}`, textAlign: 'right' as const, fontSize: bold ? '16px' : '14px', color: TEXT_DARK, fontWeight: bold ? 700 : 500 }}>
          {value}
        </td>
      </tr>
    </tbody>
  </table>
)

export const template = {
  component: Email,
  subject: (d: Props) =>
    isFail(d.evento)
      ? `No pudimos procesar tu pago${d.monto ? ` de ${d.monto}` : ''} — RutApp`
      : `Pago recibido${d.monto ? ` de ${d.monto}` : ''} — RutApp`,
  displayName: 'Notificación de cobro al cliente',
  previewData: {
    evento: 'cobro_fallido',
    nombre: 'Juan',
    empresa: 'Empresa Demo',
    monto: '$2,700 MXN',
    folio: 'RUT-002',
    fecha: '15/06/2026',
    metodoPago: 'Visa terminación 4582',
    detalle: 'Tu banco rechazó el cargo',
    payUrl: 'https://rutapp.mx/factura/RUT-002',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#f1f5f9', fontFamily: '-apple-system, "Segoe UI", Roboto, Arial, sans-serif', padding: '32px 12px' }
const card = { maxWidth: '560px', margin: '0 auto', background: '#ffffff', borderRadius: '20px', padding: '24px 0 0', boxShadow: '0 4px 24px rgba(15, 23, 42, 0.06)' }
const brand = { fontSize: '12px', letterSpacing: '4px', color: TEXT_MUTED, fontWeight: 700, marginTop: '8px', textAlign: 'center' as const }
const h1 = { fontSize: '22px', margin: 0, fontWeight: 800, color: TEXT_DARK, lineHeight: 1.3 }
const subtitle = { fontSize: '14px', color: TEXT_MUTED, margin: '10px 0 0', lineHeight: 1.6 }
const dataCard = { margin: '20px 32px', border: `1px solid ${BORDER}`, borderRadius: '14px', overflow: 'hidden' as const }
const pill = { padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, display: 'inline-block' }
const pillSub = { fontSize: '13px', color: TEXT_MUTED, margin: '10px 0 16px', textAlign: 'center' as const }
const btnPrimary = { background: PRIMARY, color: '#ffffff', padding: '14px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 700, textDecoration: 'none', display: 'block', textAlign: 'center' as const, width: '100%', boxSizing: 'border-box' as const }
const btnSecondary = { background: '#ffffff', color: PRIMARY, padding: '13px 24px', borderRadius: '12px', fontSize: '15px', fontWeight: 600, textDecoration: 'none', display: 'block', textAlign: 'center' as const, width: '100%', boxSizing: 'border-box' as const, border: `1.5px solid ${PRIMARY}` }
const footerWrap = { borderTop: `1px solid ${BORDER}`, padding: '20px 32px', margin: 0 }
const footerTitle = { fontSize: '13px', color: TEXT_DARK, margin: 0, fontWeight: 700 }
const footerSub = { fontSize: '12px', color: TEXT_MUTED, margin: '2px 0 0' }
const footerLine = { fontSize: '13px', color: TEXT_DARK, margin: '0 0 4px' }
