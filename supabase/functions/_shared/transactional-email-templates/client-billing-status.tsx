import * as React from 'npm:react@18.3.1'
import {
  Body,
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
const PRIMARY_HEX = '1554F0'
const SUCCESS = '#16a34a'
const DANGER = '#dc2626'
const TEXT_DARK = '#0f172a'
const TEXT_MUTED = '#64748b'
const BORDER = '#e2e8f0'

// ── Hosted PNG icons (icons8 CDN — Gmail/Outlook/Apple Mail safe) ──
const ICON = {
  calendar:  `https://img.icons8.com/ios-filled/48/${PRIMARY_HEX}/calendar.png`,
  card:      `https://img.icons8.com/ios-filled/48/${PRIMARY_HEX}/bank-card-back-side.png`,
  dollar:    `https://img.icons8.com/ios-filled/48/${PRIMARY_HEX}/us-dollar-circled--v1.png`,
  doc:       `https://img.icons8.com/ios-filled/48/${PRIMARY_HEX}/document.png`,
  info:      `https://img.icons8.com/ios-filled/48/${PRIMARY_HEX}/info--v1.png`,
  headset:   `https://img.icons8.com/ios-filled/48/${PRIMARY_HEX}/headset.png`,
  mail:      `https://img.icons8.com/ios-filled/48/${PRIMARY_HEX}/new-post.png`,
  whatsapp:  `https://img.icons8.com/ios-filled/48/${PRIMARY_HEX}/whatsapp.png`,
  bigFail:   `https://img.icons8.com/fluency/96/cancel.png`,
  bigSuccess:`https://img.icons8.com/fluency/96/ok.png`,
}

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
  const heroIcon = fail ? ICON.bigFail : ICON.bigSuccess

  return (
    <Html lang="es">
      <Head />
      <Preview>{fail ? `Pago pendiente${monto ? ` de ${monto}` : ''} — RutApp` : `Pago confirmado${monto ? ` de ${monto}` : ''} — RutApp`}</Preview>
      <Body style={main}>
        <Container style={card}>
          {/* Logo */}
          <Section>
            <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%" style={tableReset}>
              <tbody>
                <tr>
                  <td align="center" style={{ padding: '24px 0 4px' }}>
                    <Img src={LOGO} width="56" height="56" alt="RutApp" style={{ display: 'block', borderRadius: '12px', border: '0', outline: 'none', textDecoration: 'none' }} />
                  </td>
                </tr>
                <tr>
                  <td align="center" style={{ padding: '8px 0 0' }}>
                    <Text style={brand}>RUTAPP</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Hero icon */}
          <Section>
            <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%" style={tableReset}>
              <tbody>
                <tr>
                  <td align="center" style={{ padding: '16px 0 4px' }}>
                    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={tableReset}>
                      <tbody>
                        <tr>
                          <td
                            align="center"
                            valign="middle"
                            width={96}
                            height={96}
                            style={{
                              width: '96px',
                              height: '96px',
                              backgroundColor: '#eff6ff',
                              borderRadius: '48px',
                              textAlign: 'center',
                              verticalAlign: 'middle',
                            }}
                          >
                            <Img
                              src={heroIcon}
                              width="56"
                              height="56"
                              alt=""
                              style={{ display: 'block', margin: '0 auto', border: '0', outline: 'none' }}
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Title + subtitle */}
          <Section>
            <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%" style={tableReset}>
              <tbody>
                <tr>
                  <td align="center" style={{ padding: '20px 32px 0' }}>
                    <Heading style={h1}>{titulo}</Heading>
                  </td>
                </tr>
                <tr>
                  <td align="center" style={{ padding: '10px 32px 0' }}>
                    <Text style={subtitle}>{subtitulo}</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Data card */}
          <Section>
            <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%" style={tableReset}>
              <tbody>
                <tr>
                  <td style={{ padding: '20px 32px 0' }}>
                    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%" style={dataCardTable}>
                      <tbody>
                        <DataRow icon={ICON.calendar} label={fail ? 'Fecha del intento' : 'Fecha'} value={fecha || '—'} />
                        {metodoPago ? <DataRow icon={ICON.card} label="Método de pago" value={metodoPago} /> : null}
                        <DataRow icon={ICON.dollar} label={fail ? 'Monto' : 'Importe'} value={monto || '—'} bold />
                        {folio ? <DataRow icon={ICON.doc} label="Folio" value={folio} /> : null}
                        {fail && detalle ? <DataRow icon={ICON.info} label="Motivo" value={detalle} last /> : null}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Status pill */}
          <Section>
            <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%" style={tableReset}>
              <tbody>
                <tr>
                  <td align="center" style={{ padding: '16px 0 0' }}>
                    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={tableReset}>
                      <tbody>
                        <tr>
                          <td style={{ ...pill, backgroundColor: accentSoft, color: accent }}>
                            <span style={{ color: accent, fontSize: '14px' }}>●</span>
                            <span style={{ display: 'inline-block', width: '8px' }}>&nbsp;</span>
                            {pillText}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style={{ padding: '10px 24px 0' }}>
                    <Text style={pillSub}>{pillNote}</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* CTAs */}
          <Section>
            <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%" style={tableReset}>
              <tbody>
                <tr>
                  <td style={{ padding: '8px 32px 0' }}>
                    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%" style={tableReset}>
                      <tbody>
                        <tr>
                          <td align="center" bgcolor={PRIMARY} style={btnPrimaryCell}>
                            <a href={primaryUrl} style={btnPrimaryLink}>{primaryLabel}</a>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
                <tr><td style={{ height: '12px', lineHeight: '12px', fontSize: '12px' }}>&nbsp;</td></tr>
                <tr>
                  <td style={{ padding: '0 32px 24px' }}>
                    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%" style={tableReset}>
                      <tbody>
                        <tr>
                          <td align="center" bgcolor="#ffffff" style={btnSecondaryCell}>
                            <a href={secondaryUrl} style={btnSecondaryLink}>{secondaryLabel}</a>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>

          {/* Footer */}
          <Section>
            <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%" style={{ ...tableReset, borderTop: `1px solid ${BORDER}` }}>
              <tbody>
                <tr>
                  <td style={{ padding: '20px 32px' }}>
                    <table role="presentation" cellPadding={0} cellSpacing={0} border={0} width="100%" style={tableReset}>
                      <tbody>
                        <tr>
                          {/* Left: Help */}
                          <td width="50%" valign="top" style={{ verticalAlign: 'top' }}>
                            <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={tableReset}>
                              <tbody>
                                <tr>
                                  <td width={28} valign="middle" style={{ verticalAlign: 'middle', paddingRight: '8px' }}>
                                    <Img src={ICON.headset} width="24" height="24" alt="" style={iconImg} />
                                  </td>
                                  <td valign="middle" style={{ verticalAlign: 'middle' }}>
                                    <Text style={footerTitle}>¿Necesitas ayuda?</Text>
                                    <Text style={footerSub}>Estamos para ayudarte</Text>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                          {/* Right: Contacts */}
                          <td width="50%" valign="top" align="right" style={{ verticalAlign: 'top', textAlign: 'right' as const }}>
                            <table role="presentation" cellPadding={0} cellSpacing={0} border={0} align="right" style={tableReset}>
                              <tbody>
                                <tr>
                                  <td width={24} valign="middle" style={{ verticalAlign: 'middle', paddingRight: '8px' }}>
                                    <Img src={ICON.mail} width="18" height="18" alt="" style={iconImg} />
                                  </td>
                                  <td valign="middle" style={{ verticalAlign: 'middle' }}>
                                    <Text style={footerLine}>soporte@rutapp.mx</Text>
                                  </td>
                                </tr>
                                <tr>
                                  <td width={24} valign="middle" style={{ verticalAlign: 'middle', paddingRight: '8px' }}>
                                    <Img src={ICON.whatsapp} width="18" height="18" alt="" style={iconImg} />
                                  </td>
                                  <td valign="middle" style={{ verticalAlign: 'middle' }}>
                                    <Text style={footerLine}>317 128 8029</Text>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
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

const DataRow = ({ icon, label, value, bold, last }: { icon: string; label: string; value: string; bold?: boolean; last?: boolean }) => (
  <tr>
    <td
      valign="middle"
      style={{
        padding: '14px 16px',
        borderBottom: last ? 'none' : `1px solid ${BORDER}`,
        verticalAlign: 'middle',
      }}
    >
      <table role="presentation" cellPadding={0} cellSpacing={0} border={0} style={tableReset}>
        <tbody>
          <tr>
            <td width={32} valign="middle" style={{ verticalAlign: 'middle', paddingRight: '8px' }}>
              <Img src={icon} width="24" height="24" alt="" style={iconImg} />
            </td>
            <td valign="middle" style={{ verticalAlign: 'middle', fontSize: '14px', color: TEXT_MUTED, fontFamily: 'Arial, sans-serif' }}>
              {label}
            </td>
          </tr>
        </tbody>
      </table>
    </td>
    <td
      align="right"
      valign="middle"
      style={{
        padding: '14px 16px',
        borderBottom: last ? 'none' : `1px solid ${BORDER}`,
        textAlign: 'right' as const,
        verticalAlign: 'middle',
        fontSize: bold ? '16px' : '14px',
        color: TEXT_DARK,
        fontWeight: bold ? 700 : 600,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      {value}
    </td>
  </tr>
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

// ── Styles (inline-only, no flex/grid/position) ──
const main = {
  backgroundColor: '#f1f5f9',
  fontFamily: 'Arial, "Helvetica Neue", Helvetica, sans-serif',
  padding: '32px 12px',
  margin: 0,
}
const card = {
  maxWidth: '560px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '20px',
  padding: '0',
}
const tableReset = { borderCollapse: 'collapse' as const, borderSpacing: 0 }
const brand = {
  fontSize: '12px',
  letterSpacing: '4px',
  color: TEXT_MUTED,
  fontWeight: 700,
  margin: 0,
  textAlign: 'center' as const,
  fontFamily: 'Arial, sans-serif',
}
const h1 = {
  fontSize: '22px',
  margin: 0,
  fontWeight: 800,
  color: TEXT_DARK,
  lineHeight: '1.3',
  textAlign: 'center' as const,
  fontFamily: 'Arial, sans-serif',
}
const subtitle = {
  fontSize: '14px',
  color: TEXT_MUTED,
  margin: 0,
  lineHeight: '1.6',
  textAlign: 'center' as const,
  fontFamily: 'Arial, sans-serif',
}
const dataCardTable = {
  borderCollapse: 'separate' as const,
  borderSpacing: 0,
  border: `1px solid ${BORDER}`,
  borderRadius: '14px',
  overflow: 'hidden' as const,
  backgroundColor: '#ffffff',
}
const pill = {
  padding: '6px 14px',
  borderRadius: '999px',
  fontSize: '13px',
  fontWeight: 600,
  fontFamily: 'Arial, sans-serif',
}
const pillSub = {
  fontSize: '13px',
  color: TEXT_MUTED,
  margin: 0,
  textAlign: 'center' as const,
  fontFamily: 'Arial, sans-serif',
}
const btnPrimaryCell = {
  backgroundColor: PRIMARY,
  borderRadius: '12px',
  padding: 0,
}
const btnPrimaryLink = {
  display: 'block',
  padding: '14px 24px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 700,
  textDecoration: 'none',
  fontFamily: 'Arial, sans-serif',
  textAlign: 'center' as const,
}
const btnSecondaryCell = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  border: `1.5px solid ${PRIMARY}`,
  padding: 0,
}
const btnSecondaryLink = {
  display: 'block',
  padding: '13px 24px',
  color: PRIMARY,
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  fontFamily: 'Arial, sans-serif',
  textAlign: 'center' as const,
}
const footerTitle = {
  fontSize: '13px',
  color: TEXT_DARK,
  margin: 0,
  fontWeight: 700,
  fontFamily: 'Arial, sans-serif',
}
const footerSub = {
  fontSize: '12px',
  color: TEXT_MUTED,
  margin: '2px 0 0',
  fontFamily: 'Arial, sans-serif',
}
const footerLine = {
  fontSize: '13px',
  color: TEXT_DARK,
  margin: '0 0 4px',
  fontFamily: 'Arial, sans-serif',
}
const iconImg = {
  display: 'block',
  border: '0',
  outline: 'none',
  textDecoration: 'none',
}
