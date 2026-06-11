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
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  clienteNombre?: string
  empresaNombre?: string
  empresaLogoUrl?: string
  empresaDireccion?: string
  empresaTelefono?: string
  empresaEmail?: string
  empresaWeb?: string
  monto?: string
  fecha?: string
  metodoPago?: string
  referencia?: string
  folios?: string
  saldoActual?: string
  portalUrl?: string
  pdfUrl?: string
  folioRecibo?: string
}

const Email = ({
  clienteNombre = 'Cliente',
  empresaNombre = 'Rutapp',
  empresaLogoUrl = '',
  empresaDireccion = '',
  empresaTelefono = '',
  empresaEmail = '',
  empresaWeb = '',
  monto = '$0.00',
  fecha = '',
  metodoPago = '',
  referencia = '',
  folios = '',
  saldoActual = '$0.00',
  portalUrl = 'https://rutapp.mx',
  pdfUrl = '',
  folioRecibo = '',
}: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Comprobante de pago por {monto} — {empresaNombre}</Preview>
    <Body style={main}>
      <Container style={outer}>
        {/* Brand bar */}
        <Section style={brandBar} />

        <Container style={container}>
          {/* Header with logo */}
          <Section style={header}>
            {empresaLogoUrl ? (
              <Img
                src={empresaLogoUrl}
                alt={empresaNombre}
                height="56"
                style={{ maxHeight: '56px', width: 'auto', margin: '0 auto' }}
              />
            ) : (
              <Heading style={h1}>{empresaNombre}</Heading>
            )}
            <Text style={subtitle}>Comprobante de pago</Text>
            {folioRecibo ? <Text style={folioStyle}>Folio: {folioRecibo}</Text> : null}
          </Section>

          <Hr style={hrTop} />

          {/* Content */}
          <Section style={content}>
            <Text style={greeting}>Estimado(a) {clienteNombre},</Text>
            <Text style={paragraph}>
              Confirmamos la recepción de su pago. A continuación los detalles de la transacción:
            </Text>

            <Section style={amountBox}>
              <Text style={amountLabel}>Monto recibido</Text>
              <Text style={amountValue}>{monto}</Text>
              <Text style={amountDate}>{fecha}</Text>
            </Section>

            <Section style={detailsBox}>
              <DetailRow label="Fecha de pago" value={fecha} />
              {metodoPago ? <DetailRow label="Método de pago" value={metodoPago} /> : null}
              {referencia ? <DetailRow label="Referencia" value={referencia} /> : null}
              {folios ? <DetailRow label="Aplicado a folio(s)" value={folios} /> : null}
              <DetailRow label="Saldo actual de su cuenta" value={saldoActual} bold highlight />
            </Section>

            <Section style={{ textAlign: 'center' as const, padding: '28px 0 8px' }}>
              <Button href={portalUrl} style={button}>
                Ver mi estado de cuenta
              </Button>
            </Section>

            {pdfUrl ? (
              <Text style={{ textAlign: 'center' as const, fontSize: '13px', color: '#475569', margin: '8px 0 0' }}>
                <Link href={pdfUrl} style={link}>📄 Descargar recibo en PDF</Link>
              </Text>
            ) : null}

            <Text style={thanks}>
              Gracias por su preferencia y puntualidad en el pago.
            </Text>
          </Section>

          {/* Company footer */}
          <Section style={companyFooter}>
            <Text style={companyName}>{empresaNombre}</Text>
            {empresaDireccion ? <Text style={companyLine}>{empresaDireccion}</Text> : null}
            <Text style={companyLine}>
              {[empresaTelefono, empresaEmail].filter(Boolean).join(' · ')}
            </Text>
            {empresaWeb ? (
              <Text style={companyLine}>
                <Link href={empresaWeb.startsWith('http') ? empresaWeb : `https://${empresaWeb}`} style={link}>
                  {empresaWeb.replace(/^https?:\/\//, '')}
                </Link>
              </Text>
            ) : null}
          </Section>

          {/* Legal / policies */}
          <Section style={legal}>
            <Text style={legalText}>
              <strong>Aviso:</strong> Este es un comprobante generado automáticamente. Conserve este correo como respaldo de su operación.
              Si no reconoce esta transacción, por favor responda a este mensaje o contacte directamente con {empresaNombre}.
            </Text>
            <Text style={legalText}>
              Sus datos personales son tratados conforme a nuestro Aviso de Privacidad. Este correo es de uso exclusivo del destinatario.
            </Text>
          </Section>

          {/* Powered by */}
          <Section style={poweredBy}>
            <Text style={poweredText}>
              Enviado mediante <Link href="https://rutapp.mx" style={poweredLink}>RutApp</Link> · Plataforma de ventas y cobranza
            </Text>
          </Section>
        </Container>
      </Container>
    </Body>
  </Html>
)

const DetailRow = ({
  label,
  value,
  bold,
  highlight,
}: {
  label: string
  value: string
  bold?: boolean
  highlight?: boolean
}) => (
  <table width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse' as const }}>
    <tbody>
      <tr>
        <td
          style={{
            padding: '8px 0',
            fontSize: '13px',
            color: '#64748b',
            borderTop: highlight ? '1px solid #e2e8f0' : 'none',
          }}
        >
          {label}
        </td>
        <td
          style={{
            padding: '8px 0',
            fontSize: '14px',
            color: highlight ? '#0c4a6e' : '#0f172a',
            textAlign: 'right' as const,
            fontWeight: bold ? 700 : 500,
            borderTop: highlight ? '1px solid #e2e8f0' : 'none',
          }}
        >
          {value}
        </td>
      </tr>
    </tbody>
  </table>
)

export const template = {
  component: Email,
  subject: (d: Props) =>
    `Comprobante de pago por ${d?.monto ?? ''} — ${d?.empresaNombre ?? 'Rutapp'}`,
  displayName: 'Recibo de cobro',
  previewData: {
    clienteNombre: 'Juan Pérez',
    empresaNombre: 'Mi Empresa',
    empresaLogoUrl: 'https://rutapp.mx/pwa-192x192.png',
    empresaDireccion: 'Av. Reforma 123, Col. Centro, CDMX',
    empresaTelefono: '+52 55 1234 5678',
    empresaEmail: 'contacto@miempresa.mx',
    empresaWeb: 'https://miempresa.mx',
    monto: '$1,250.00',
    fecha: '11/06/2026',
    metodoPago: 'Efectivo',
    referencia: 'REF-001',
    folios: 'V-00123',
    saldoActual: '$0.00',
    portalUrl: 'https://rutapp.mx/cliente/demo',
    pdfUrl: 'https://rutapp.mx/recibo.pdf',
    folioRecibo: 'REC-00045',
  },
} satisfies TemplateEntry

// Styles
const main = {
  backgroundColor: '#ffffff',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
  margin: 0,
  padding: '20px 0',
}
const outer = { maxWidth: '620px', margin: '0 auto', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' as const }
const brandBar = { height: '6px', background: 'linear-gradient(90deg, hsl(221, 83%, 53%), hsl(199, 89%, 48%))' }
const container = { padding: '0' }
const header = { padding: '32px 32px 12px', textAlign: 'center' as const }
const h1 = { margin: 0, fontSize: '24px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }
const subtitle = { margin: '12px 0 0', fontSize: '11px', color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '2px', fontWeight: 600 }
const folioStyle = { margin: '6px 0 0', fontSize: '12px', color: '#94a3b8' }
const hrTop = { borderColor: '#e2e8f0', margin: '8px 32px 0' }
const content = { padding: '24px 32px 8px' }
const greeting = { fontSize: '15px', color: '#0f172a', margin: '0 0 8px', fontWeight: 600 }
const paragraph = { fontSize: '14px', color: '#334155', margin: '0 0 20px', lineHeight: '1.5' }
const amountBox = {
  background: '#f0f9ff',
  border: '1px solid #bae6fd',
  borderRadius: '10px',
  padding: '24px',
  textAlign: 'center' as const,
  margin: '0 0 16px',
}
const amountLabel = { fontSize: '11px', color: '#075985', textTransform: 'uppercase' as const, letterSpacing: '2px', margin: 0, fontWeight: 600 }
const amountValue = { fontSize: '34px', fontWeight: 700, color: '#0c4a6e', margin: '8px 0 0', letterSpacing: '-1px' }
const amountDate = { fontSize: '12px', color: '#0369a1', margin: '4px 0 0' }
const detailsBox = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 18px' }
const button = {
  background: 'hsl(221, 83%, 53%)',
  color: '#ffffff',
  padding: '14px 32px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 600,
  display: 'inline-block',
}
const link = { color: 'hsl(221, 83%, 53%)', textDecoration: 'underline' }
const thanks = { fontSize: '13px', color: '#475569', textAlign: 'center' as const, margin: '24px 0 0', fontStyle: 'italic' as const }
const companyFooter = { padding: '24px 32px 8px', textAlign: 'center' as const, borderTop: '1px solid #e2e8f0', marginTop: '16px' }
const companyName = { fontSize: '14px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }
const companyLine = { fontSize: '12px', color: '#64748b', margin: '2px 0' }
const legal = { padding: '12px 32px 16px' }
const legalText = { fontSize: '11px', color: '#94a3b8', margin: '6px 0', lineHeight: '1.5', textAlign: 'center' as const }
const poweredBy = { padding: '12px 32px 24px', textAlign: 'center' as const, borderTop: '1px solid #f1f5f9' }
const poweredText = { fontSize: '11px', color: '#cbd5e1', margin: 0 }
const poweredLink = { color: '#94a3b8', textDecoration: 'none', fontWeight: 600 }
