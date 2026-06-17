/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  empresaNombre?: string
  folio?: string
  serie?: string
  uuid?: string
  total?: number | string
  pdfUrl?: string
  xmlUrl?: string
  mensaje?: string
}

const fmt = (n: any) => {
  const num = typeof n === 'number' ? n : Number(n || 0)
  return num.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

const Email = ({ empresaNombre, folio, serie, uuid, total, pdfUrl, xmlUrl, mensaje }: Props) => (
  <Html lang="es" dir="ltr">
    <Head />
    <Preview>Tu factura electrónica {serie || ''}{folio ? `-${folio}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Factura Electrónica</Heading>
        <Text style={text}>
          {empresaNombre ? `${empresaNombre} ` : ''}te envía tu factura electrónica (CFDI 4.0).
        </Text>

        {mensaje ? <Text style={text}>{mensaje}</Text> : null}

        <Section style={card}>
          {serie || folio ? (
            <Text style={kv}><strong>Folio:</strong> {serie || ''}{folio ? `-${folio}` : ''}</Text>
          ) : null}
          {uuid ? <Text style={kv}><strong>UUID:</strong> {uuid}</Text> : null}
          {total !== undefined ? (
            <Text style={kv}><strong>Total:</strong> {fmt(total)}</Text>
          ) : null}
        </Section>

        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          {pdfUrl ? (
            <Button href={pdfUrl} style={btnPrimary}>Descargar PDF</Button>
          ) : null}
        </Section>

        {xmlUrl ? (
          <Text style={text}>
            También puedes descargar el XML aquí:{' '}
            <Link href={xmlUrl} style={link}>Descargar XML</Link>
          </Text>
        ) : null}

        <Text style={footer}>
          Conserva ambos archivos (PDF y XML) para tu contabilidad.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Tu factura ${d.serie || ''}${d.folio ? `-${d.folio}` : ''}`.trim() || 'Tu factura electrónica',
  displayName: 'Envío de CFDI',
  previewData: { empresaNombre: 'Mi Empresa', folio: '1234', serie: 'A', uuid: 'XXXX-YYYY-ZZZZ', total: 1234.56, pdfUrl: 'https://example.com/factura.pdf', xmlUrl: 'https://example.com/factura.xml' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { color: '#0f172a', fontSize: '22px', margin: '0 0 12px' }
const text = { color: '#334155', fontSize: '14px', lineHeight: '22px', margin: '0 0 12px' }
const card = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', margin: '16px 0' }
const kv = { color: '#0f172a', fontSize: '14px', margin: '4px 0' }
const btnPrimary = { background: '#0f172a', color: '#ffffff', padding: '12px 20px', borderRadius: '6px', textDecoration: 'none', fontSize: '14px', fontWeight: 600 }
const link = { color: '#2563eb', textDecoration: 'underline' }
const footer = { color: '#64748b', fontSize: '12px', marginTop: '20px' }
