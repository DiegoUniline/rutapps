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

// ── SVG icon helpers (data URIs so Gmail/Outlook render them) ──
const svg = (markup: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`

const iconCalendar = (c: string) => svg(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='5' width='18' height='16' rx='2'/><path d='M3 9h18'/><path d='M8 3v4M16 3v4'/><circle cx='8' cy='14' r='1' fill='${c}'/><circle cx='12' cy='14' r='1' fill='${c}'/><circle cx='16' cy='14' r='1' fill='${c}'/></svg>`
)
const iconCard = (c: string) => svg(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='2' y='5' width='20' height='14' rx='2'/><path d='M2 10h20'/></svg>`
)
const iconDollar = (c: string) => svg(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M12 6v12M15 9.5a2.5 2.5 0 0 0-2.5-2.5h-1A2.5 2.5 0 0 0 9 9.5c0 1.4 1.1 2.5 2.5 2.5h1A2.5 2.5 0 0 1 15 14.5 2.5 2.5 0 0 1 12.5 17h-1A2.5 2.5 0 0 1 9 14.5'/></svg>`
)
const iconDoc = (c: string) => svg(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z'/><path d='M14 3v6h6'/><path d='M8 13h6M8 17h8'/></svg>`
)
const iconInfo = (c: string) => svg(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='10'/><path d='M12 16v-4M12 8h.01'/></svg>`
)
const iconHeadset = (c: string) => svg(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 14v-2a9 9 0 0 1 18 0v2'/><path d='M21 14a2 2 0 0 1-2 2h-1v-5h1a2 2 0 0 1 2 2zM3 14a2 2 0 0 0 2 2h1v-5H5a2 2 0 0 0-2 2z'/><path d='M18 16v1a3 3 0 0 1-3 3h-2'/></svg>`
)
const iconMail = (c: string) => svg(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='3' y='5' width='18' height='14' rx='2'/><path d='m3 7 9 6 9-6'/></svg>`
)
const iconWhatsapp = (c: string) => svg(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='${c}'><path d='M20.5 3.5A11 11 0 0 0 3.2 17.3L2 22l4.8-1.2A11 11 0 1 0 20.5 3.5zM12 20a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 20zm4.4-5.6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8 1-.1.2-.3.2-.5.1-.7-.4-1.5-.8-2.1-1.6-.5-.6-.9-1.3-1-1.5 0-.2 0-.3.1-.4l.4-.4c.1-.1.1-.2.2-.4 0-.2 0-.3 0-.4 0-.1-.5-1.2-.7-1.7-.2-.4-.4-.3-.5-.4h-.4c-.2 0-.4 0-.6.3-.2.2-.8.8-.8 2s.8 2.3.9 2.5c.1.1 1.7 2.6 4.2 3.6.6.2 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1z'/></svg>`
)
// Big card with red X badge (failure) / green check badge (success)
const iconBigCard = (fail: boolean) => svg(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64' fill='none'>
    <rect x='6' y='14' width='46' height='32' rx='5' fill='none' stroke='${PRIMARY}' stroke-width='3'/>
    <rect x='6' y='22' width='46' height='6' fill='${PRIMARY}'/>
    <circle cx='50' cy='46' r='10' fill='${fail ? DANGER : SUCCESS}'/>
    ${fail
      ? `<path d='M46 42l8 8M54 42l-8 8' stroke='#fff' stroke-width='2.5' stroke-linecap='round'/>`
      : `<path d='M45 46l4 4 7-7' stroke='#fff' stroke-width='2.8' stroke-linecap='round' stroke-linejoin='round' fill='none'/>`
    }
  </svg>`
)

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

          {/* Big status icon — card with badge */}
          <Section style={{ textAlign: 'center', padding: '12px 0 0' }}>
            <table style={{ margin: '0 auto', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td
                    style={{
                      width: '96px',
                      height: '96px',
                      background: '#eff6ff',
                      borderRadius: '50%',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                    }}
                  >
                    <Img src={iconBigCard(fail)} width="56" height="56" alt="" style={{ display: 'inline-block' }} />
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
            <DataRow icon={iconCalendar(PRIMARY)} label={fail ? 'Fecha del intento' : 'Fecha'} value={fecha || '—'} />
            {metodoPago ? <DataRow icon={iconCard(PRIMARY)} label="Método de pago" value={metodoPago} /> : null}
            <DataRow icon={iconDollar(PRIMARY)} label={fail ? 'Monto' : 'Importe'} value={monto || '—'} bold />
            {folio ? <DataRow icon={iconDoc(PRIMARY)} label="Folio" value={folio} /> : null}
            {fail && detalle ? <DataRow icon={iconInfo(PRIMARY)} label="Motivo" value={detalle} /> : null}
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
                    <table style={{ borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr>
                          <td style={{ paddingRight: '10px', verticalAlign: 'middle' }}>
                            <Img src={iconHeadset(PRIMARY)} width="22" height="22" alt="" />
                          </td>
                          <td style={{ verticalAlign: 'middle' }}>
                            <Text style={footerTitle}>¿Necesitas ayuda?</Text>
                            <Text style={footerSub}>Estamos para ayudarte</Text>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                  <td style={{ width: '50%', verticalAlign: 'top', textAlign: 'right' as const }}>
                    <table style={{ borderCollapse: 'collapse', marginLeft: 'auto' }}>
                      <tbody>
                        <tr>
                          <td style={{ paddingRight: '8px', verticalAlign: 'middle' }}>
                            <Img src={iconMail(PRIMARY)} width="16" height="16" alt="" />
                          </td>
                          <td style={{ verticalAlign: 'middle' }}>
                            <Text style={footerLine}>soporte@rutapp.mx</Text>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ paddingRight: '8px', verticalAlign: 'middle' }}>
                            <Img src={iconWhatsapp(PRIMARY)} width="16" height="16" alt="" />
                          </td>
                          <td style={{ verticalAlign: 'middle' }}>
                            <Text style={footerLine}>317 128 8029</Text>
                          </td>
                        </tr>
                      </tbody>
                    </table>
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

const DataRow = ({ icon, label, value, bold }: { icon: string; label: string; value: string; bold?: boolean }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
    <tbody>
      <tr>
        <td style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle' }}>
          <table style={{ borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ width: '32px', verticalAlign: 'middle' }}>
                  <Img src={icon} width="20" height="20" alt="" />
                </td>
                <td style={{ fontSize: '14px', color: TEXT_MUTED, verticalAlign: 'middle' }}>{label}</td>
              </tr>
            </tbody>
          </table>
        </td>
        <td style={{ padding: '14px 16px', borderBottom: `1px solid ${BORDER}`, textAlign: 'right' as const, fontSize: bold ? '16px' : '14px', color: TEXT_DARK, fontWeight: bold ? 700 : 600 }}>
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
