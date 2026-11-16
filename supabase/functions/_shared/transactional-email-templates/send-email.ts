import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { TEMPLATES } from './registry.ts'

// Server-only: reads RESEND_API_KEY. Import from edge functions only — never
// expose sending to the browser.

// Configuration baked in at scaffold time
const SITE_NAME = "Rutapp Ventas Inteligentes"
// FROM_DOMAIN must be a domain verified in Resend. Override with EMAIL_FROM_DOMAIN.
const FROM_DOMAIN = Deno.env.get('EMAIL_FROM_DOMAIN') || "rutapp.mx"
const RESEND_URL = "https://api.resend.com/emails"

export type SendTemplateEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' }

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>
  /** Dedupes retries of the same logical send; defaults to a random UUID (no dedupe). */
  idempotencyKey?: string
  replyTo?: string
  /** Optional customer-facing display name while preserving the verified RutApp sender domain. */
  fromName?: string
}

/**
 * Renders a registered template and sends it through Resend.
 * Any failure throws with the HTTP status and Resend's error message.
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {}
): Promise<SendTemplateEmailResult> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`
    )
  }

  // Template-level `to` takes precedence — notification templates always
  // send to their fixed address.
  const fixedTo =
    typeof template.to === 'function'
      ? template.to(options.templateData ?? {})
      : template.to
  const recipient = fixedTo || to
  if (!recipient) {
    throw new Error('Recipient is required (the template defines no fixed recipient)')
  }

  const templateData = options.templateData ?? {}
  const element = React.createElement(template.component, templateData)
  const html = await renderAsync(element)
  const text = await renderAsync(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject
  const safeFromName = String(options.fromName || SITE_NAME)
    .replace(/[\r\n"]/g, ' ')
    .trim()
    .slice(0, 100) || SITE_NAME

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': options.idempotencyKey || crypto.randomUUID(),
    },
    body: JSON.stringify({
      from: `"${safeFromName}" <noreply@${FROM_DOMAIN}>`,
      to: [recipient],
      subject,
      html,
      text,
      ...(options.replyTo ? { reply_to: options.replyTo } : {}),
      tags: [{ name: 'template', value: templateName.replace(/[^A-Za-z0-9_-]/g, '_') }],
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend ${res.status}: ${detail.slice(0, 500)}`)
  }

  return { sent: true }
}
