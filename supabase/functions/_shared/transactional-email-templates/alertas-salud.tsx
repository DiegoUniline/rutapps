import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

// D-064 · Resumen horario de alertas de salud (solo para el equipo de RutApp).
interface Props {
  asunto?: string
  secciones?: { titulo: string; lineas: string[] }[]
  panelUrl?: string
}

const Email = ({ asunto, secciones = [], panelUrl }: Props) => (
  <Html lang="es">
    <Head />
    <Preview>{asunto || 'Alertas de salud de RutApp'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Alertas de salud</Heading>
        <Text style={sub}>Solo se avisa lo nuevo desde el último correo.</Text>
        {secciones.map((s) => (
          <Section key={s.titulo} style={card}>
            <Text style={h2}>{s.titulo} ({s.lineas.length})</Text>
            {s.lineas.map((l, i) => (
              <Text key={i} style={linea}>• {l}</Text>
            ))}
          </Section>
        ))}
        <Hr style={hr} />
        <Text style={footer}>
          {panelUrl ? `Detalle en el Panel Master → Salud: ${panelUrl}` : 'Detalle en el Panel Master → Salud.'}
          <br />Correo automático · no responder.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (d: Props) => d.asunto || 'RutApp · alertas de salud',
  displayName: 'Alertas de salud',
  previewData: {
    asunto: 'RutApp · 2 alertas de salud',
    secciones: [
      { titulo: 'Crons fallidos', lineas: ['Cron fallido: purge-gps-history-daily — column "created_at" does not exist'] },
      { titulo: 'Celulares', lineas: ['3 operación(es) fallida(s) en un celular — Juan · Empresa Demo · disp. abc123'] },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#f4f6f9', fontFamily: '-apple-system, "Segoe UI", Arial, sans-serif', padding: '24px 0' }
const container = { maxWidth: '640px', margin: '0 auto', background: '#ffffff', borderRadius: '12px', padding: '24px 28px' }
const h1 = { fontSize: '20px', margin: '0 0 4px', color: '#111827' }
const sub = { fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }
const card = { border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px 14px', margin: '0 0 12px', background: '#fafafa' }
const h2 = { fontSize: '14px', fontWeight: 700, color: '#b91c1c', margin: '6px 0' }
const linea = { fontSize: '13px', color: '#111827', margin: '4px 0', wordBreak: 'break-word' as const }
const hr = { borderColor: '#e5e7eb', margin: '16px 0' }
const footer = { fontSize: '11px', color: '#9ca3af', lineHeight: 1.6 }
