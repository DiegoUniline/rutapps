/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface ProductoResumen {
  nombre: string
  cantidad: number | string
  unidad?: string
}

interface Props {
  empresaNombre?: string
  proveedorNombre?: string
  folio?: string
  fechaRequerida?: string
  publicUrl?: string
  totalPartidas?: number
  totalUnidades?: number | string
  productos?: ProductoResumen[]
  mensaje?: string
  isCopy?: boolean
}

const Email = ({
  empresaNombre = 'Tu cliente', proveedorNombre = 'Proveedor', folio = 'Solicitud de compra',
  fechaRequerida, publicUrl, totalPartidas = 0, totalUnidades = 0, productos = [], mensaje, isCopy,
}: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>{empresaNombre} te envió la solicitud de compra {folio}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brand}>RutApp Compras</Text>
          <Text style={brandSub}>{empresaNombre}</Text>
        </Section>

        <Section style={content}>
          <Text style={eyebrow}>{isCopy ? 'COPIA INTERNA' : 'NUEVA SOLICITUD DE COMPRA'}</Text>
          <Heading style={h1}>{folio}</Heading>
          <Text style={text}>
            {isCopy
              ? `Se envió esta solicitud a ${proveedorNombre}. Recibes esta copia para seguimiento interno.`
              : `Hola ${proveedorNombre}. ${empresaNombre} te solicita confirmar disponibilidad, costo y fecha estimada de entrega.`}
          </Text>
          {mensaje ? <Text style={message}>{mensaje}</Text> : null}

          <Section style={summaryGrid}>
            <Text style={summaryItem}><strong>{totalPartidas}</strong><br/><span style={muted}>productos</span></Text>
            <Text style={summaryItem}><strong>{totalUnidades}</strong><br/><span style={muted}>unidades solicitadas</span></Text>
            <Text style={summaryItem}><strong>{fechaRequerida || 'Por confirmar'}</strong><br/><span style={muted}>fecha requerida</span></Text>
          </Section>

          {productos.slice(0, 6).map((p, idx) => (
            <Section key={`${p.nombre}-${idx}`} style={productRow}>
              <Text style={productName}>{p.nombre}</Text>
              <Text style={productQty}>{p.cantidad} {p.unidad || ''}</Text>
            </Section>
          ))}
          {productos.length > 6 ? (
            <Text style={more}>+ {productos.length - 6} productos más</Text>
          ) : null}

          <Section style={{ textAlign: 'center', margin: '28px 0 18px' }}>
            <Button href={publicUrl || 'https://rutapp.mx'} style={button}>
              {isCopy ? 'Ver solicitud' : 'Revisar y responder solicitud'}
            </Button>
          </Section>

          <Section style={securityBox}>
            <Text style={securityTitle}>Enlace seguro y exclusivo</Text>
            <Text style={securityText}>No necesitas usuario ni contraseña. El enlace da acceso únicamente a esta solicitud.</Text>
          </Section>

          <Text style={footer}>Enviado mediante RutApp · rutapp.mx</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Props) => `${d.empresaNombre || 'Cliente'} · Solicitud de compra ${d.folio || ''}`.trim(),
  displayName: 'Solicitud de compra a proveedor',
  previewData: {
    empresaNombre: 'Distribuidora Demo',
    proveedorNombre: 'Proveedor ABC',
    folio: 'SC-2026-A1B2C3D4',
    fechaRequerida: '15 sep 2026',
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

const main = { backgroundColor: '#f1f5f9', fontFamily: "Inter,Arial,Helvetica,sans-serif", padding: '28px 12px' }
const container = { maxWidth: '620px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '18px', overflow: 'hidden', boxShadow: '0 8px 28px rgba(15,23,42,.08)' }
const brandBar = { backgroundColor: '#111827', padding: '22px 28px' }
const brand = { color: '#fb923c', fontSize: '15px', fontWeight: 800, margin: 0, letterSpacing: '.3px' }
const brandSub = { color: '#ffffff', fontSize: '20px', fontWeight: 700, margin: '5px 0 0' }
const content = { padding: '30px 28px 26px' }
const eyebrow = { color: '#ea580c', fontSize: '11px', fontWeight: 800, letterSpacing: '1.2px', margin: '0 0 8px' }
const h1 = { color: '#0f172a', fontSize: '28px', lineHeight: '34px', margin: '0 0 14px' }
const text = { color: '#475569', fontSize: '15px', lineHeight: '23px', margin: '0 0 14px' }
const message = { color: '#334155', backgroundColor: '#fff7ed', borderLeft: '4px solid #f97316', padding: '12px 14px', fontSize: '14px', lineHeight: '21px', borderRadius: '0 8px 8px 0' }
const summaryGrid = { backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 8px', margin: '22px 0' }
const summaryItem = { width: '33.33%', display: 'inline-block', textAlign: 'center' as const, color: '#0f172a', fontSize: '15px', lineHeight: '19px', margin: 0 }
const muted = { color: '#94a3b8', fontSize: '11px', fontWeight: 500 }
const productRow = { borderBottom: '1px solid #eef2f7', padding: '10px 0' }
const productName = { color: '#1e293b', fontSize: '14px', fontWeight: 600, margin: 0, display: 'inline-block', width: '72%' }
const productQty = { color: '#0f172a', fontSize: '14px', fontWeight: 700, margin: 0, display: 'inline-block', width: '28%', textAlign: 'right' as const }
const more = { color: '#64748b', fontSize: '12px', margin: '10px 0 0' }
const button = { backgroundColor: '#f97316', color: '#ffffff', padding: '14px 24px', borderRadius: '10px', textDecoration: 'none', fontSize: '14px', fontWeight: 800 }
const securityBox = { backgroundColor: '#f8fafc', borderRadius: '10px', padding: '13px 15px', marginTop: '8px' }
const securityTitle = { color: '#334155', fontSize: '12px', fontWeight: 800, margin: '0 0 3px' }
const securityText = { color: '#64748b', fontSize: '11px', lineHeight: '17px', margin: 0 }
const footer = { color: '#94a3b8', fontSize: '11px', textAlign: 'center' as const, margin: '24px 0 0' }
