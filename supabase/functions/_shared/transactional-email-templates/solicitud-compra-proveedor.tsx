/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface ProductoResumen {
  nombre: string
  cantidad: number | string
  unidad?: string
}

interface Props {
  empresaNombre?: string
  empresaEmail?: string
  empresaTelefono?: string
  empresaLogoUrl?: string
  proveedorNombre?: string
  folio?: string
  publicUrl?: string
  totalPartidas?: number
  totalUnidades?: number | string
  productos?: ProductoResumen[]
  mensaje?: string
  isCopy?: boolean
}

const PRIMARY = '#1554F0'
const TEXT_DARK = '#0f172a'
const TEXT_MUTED = '#64748b'
const BORDER = '#e2e8f0'

const Email = ({
  empresaNombre = 'Tu cliente', empresaEmail, empresaTelefono, empresaLogoUrl,
  proveedorNombre = 'Proveedor', folio = 'Solicitud de compra', publicUrl,
  totalPartidas = 0, totalUnidades = 0, productos = [], mensaje, isCopy,
}: Props) => {
  const contactLine = [empresaEmail, empresaTelefono].filter(Boolean).join(' · ')

  return (
    <Html lang="es" dir="ltr">
      <Head />
      <Preview>{empresaNombre} · Solicitud de compra {folio}{contactLine ? ` · ${contactLine}` : ''}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            {empresaLogoUrl ? <Img src={empresaLogoUrl} width="92" alt={empresaNombre} style={{ margin: '0 auto 12px', maxHeight: '64px', objectFit: 'contain' as const }} /> : null}
            <Text style={companyName}>{empresaNombre}</Text>
            {contactLine ? <Text style={companyContact}>{contactLine}</Text> : null}
            <Text style={headerSub}>Solicitud de compra · Portal de proveedores</Text>
          </Section>

          <Section style={content}>
            <Text style={eyebrow}>{isCopy ? `${empresaNombre.toUpperCase()} · COPIA INTERNA` : `${empresaNombre.toUpperCase()} · SOLICITUD DE COMPRA`}</Text>
            <Heading style={h1}>{folio}</Heading>
            <Text style={text}>
              {isCopy
                ? `${empresaNombre} envió esta solicitud a ${proveedorNombre}. Recibes esta copia para seguimiento interno.`
                : `Hola ${proveedorNombre}. ${empresaNombre} te solicita confirmar disponibilidad, cantidad y costo de los siguientes productos.`}
            </Text>

            {(empresaEmail || empresaTelefono) ? (
              <Section style={contactBox}>
                <Text style={contactTitle}>Datos de contacto de {empresaNombre}</Text>
                {empresaEmail ? <Text style={contactText}>Correo: {empresaEmail}</Text> : null}
                {empresaTelefono ? <Text style={contactText}>Teléfono: {empresaTelefono}</Text> : null}
              </Section>
            ) : null}

            {mensaje ? <Text style={message}><strong>Mensaje de {empresaNombre}:</strong><br/>{mensaje}</Text> : null}

            <Section style={summaryGrid}>
              <Text style={summaryItem}><strong>{totalPartidas}</strong><br/><span style={muted}>productos</span></Text>
              <Text style={summaryItem}><strong>{totalUnidades}</strong><br/><span style={muted}>cantidad solicitada</span></Text>
            </Section>

            {productos.slice(0, 6).map((p, idx) => (
              <Section key={`${p.nombre}-${idx}`} style={productRow}>
                <Text style={productName}>{p.nombre}</Text>
                <Text style={productQty}>{p.cantidad} {p.unidad || ''}</Text>
              </Section>
            ))}
            {productos.length > 6 ? (
              <Text style={more}>+ {productos.length - 6} productos más solicitados por {empresaNombre}</Text>
            ) : null}

            <Section style={{ textAlign: 'center', margin: '28px 0 18px' }}>
              <Button href={publicUrl || 'https://rutapp.mx'} style={button}>
                {isCopy ? `Ver solicitud de ${empresaNombre}` : `Revisar y responder a ${empresaNombre}`}
              </Button>
            </Section>

            <Section style={securityBox}>
              <Text style={securityTitle}>Enlace privado de {empresaNombre}</Text>
              <Text style={securityText}>No necesitas usuario ni contraseña. Este enlace da acceso únicamente a esta solicitud de {empresaNombre}.</Text>
            </Section>

            <Section style={footerBox}>
              <Text style={footerCompany}>{empresaNombre}</Text>
              {empresaEmail ? <Text style={footerLine}>{empresaEmail}</Text> : null}
              {empresaTelefono ? <Text style={footerLine}>{empresaTelefono}</Text> : null}
              <Text style={footerPowered}>Gestión segura mediante RutApp · rutapp.mx</Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) => `${d.empresaNombre || 'Cliente'} · Solicitud de compra ${d.folio || ''}`.trim(),
  displayName: 'Solicitud de compra a proveedor',
  previewData: {
    empresaNombre: 'Distribuidora Demo',
    empresaEmail: 'compras@distribuidora.mx',
    empresaTelefono: '+52 317 000 0000',
    proveedorNombre: 'Proveedor ABC',
    folio: 'SC-2026-A1B2C3D4',
    publicUrl: 'https://rutapp.mx/proveedor/solicitud-compra.html?token=demo',
    totalPartidas: 3,
    totalUnidades: 190,
    productos: [
      { nombre: 'Agua 600 ml', cantidad: 120, unidad: 'pz' },
      { nombre: 'Aceite 1 L', cantidad: 40, unidad: 'pz' },
      { nombre: 'Jabón', cantidad: 30, unidad: 'pz' },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "Inter,Arial,Helvetica,sans-serif", padding: '28px 12px' }
const container = { maxWidth: '620px', margin: '0 auto', backgroundColor: '#ffffff', border: `1px solid ${BORDER}`, borderRadius: '18px', overflow: 'hidden' }
const header = { backgroundColor: '#f8fafc', borderBottom: `1px solid ${BORDER}`, padding: '26px 28px 20px', textAlign: 'center' as const }
const companyName = { color: TEXT_DARK, fontSize: '22px', lineHeight: '28px', fontWeight: 800, margin: '0' }
const companyContact = { color: '#475569', fontSize: '12px', lineHeight: '18px', fontWeight: 600, margin: '7px 0 0' }
const headerSub = { color: TEXT_MUTED, fontSize: '11px', fontWeight: 600, margin: '9px 0 0' }
const content = { padding: '30px 28px 26px' }
const eyebrow = { color: PRIMARY, fontSize: '11px', fontWeight: 800, letterSpacing: '1.1px', margin: '0 0 8px' }
const h1 = { color: TEXT_DARK, fontSize: '28px', lineHeight: '34px', margin: '0 0 14px' }
const text = { color: '#475569', fontSize: '15px', lineHeight: '23px', margin: '0 0 14px' }
const contactBox = { backgroundColor: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '13px 15px', margin: '16px 0' }
const contactTitle = { color: TEXT_DARK, fontSize: '12px', fontWeight: 800, margin: '0 0 5px' }
const contactText = { color: '#475569', fontSize: '12px', lineHeight: '18px', margin: '2px 0' }
const message = { color: '#334155', backgroundColor: '#eef4ff', borderLeft: `4px solid ${PRIMARY}`, padding: '12px 14px', fontSize: '14px', lineHeight: '21px', borderRadius: '0 8px 8px 0' }
const summaryGrid = { backgroundColor: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '14px 8px', margin: '22px 0' }
const summaryItem = { width: '50%', display: 'inline-block', textAlign: 'center' as const, color: TEXT_DARK, fontSize: '15px', lineHeight: '19px', margin: 0 }
const muted = { color: '#94a3b8', fontSize: '11px', fontWeight: 500 }
const productRow = { borderBottom: '1px solid #eef2f7', padding: '10px 0' }
const productName = { color: '#1e293b', fontSize: '14px', fontWeight: 600, margin: 0, display: 'inline-block', width: '72%' }
const productQty = { color: TEXT_DARK, fontSize: '14px', fontWeight: 700, margin: 0, display: 'inline-block', width: '28%', textAlign: 'right' as const }
const more = { color: TEXT_MUTED, fontSize: '12px', margin: '10px 0 0' }
const button = { backgroundColor: PRIMARY, color: '#ffffff', padding: '14px 24px', borderRadius: '10px', textDecoration: 'none', fontSize: '14px', fontWeight: 800 }
const securityBox = { backgroundColor: '#f8fafc', border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '13px 15px', marginTop: '8px' }
const securityTitle = { color: '#334155', fontSize: '12px', fontWeight: 800, margin: '0 0 3px' }
const securityText = { color: TEXT_MUTED, fontSize: '11px', lineHeight: '17px', margin: 0 }
const footerBox = { borderTop: `1px solid ${BORDER}`, marginTop: '24px', paddingTop: '18px', textAlign: 'center' as const }
const footerCompany = { color: TEXT_DARK, fontSize: '13px', fontWeight: 800, margin: '0 0 4px' }
const footerLine = { color: '#475569', fontSize: '11px', lineHeight: '16px', margin: '1px 0' }
const footerPowered = { color: '#94a3b8', fontSize: '10px', margin: '9px 0 0' }
