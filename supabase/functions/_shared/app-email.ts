import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendTemplateEmail } from './transactional-email-templates/send-email.ts'

/**
 * Sends a registered template through Lovable's managed email API and records
 * the outcome in email_send_log (append-only, notification purposes only —
 * the log never gates a send).
 */
export interface SendAppEmailOptions {
  templateData?: Record<string, unknown>
  idempotencyKey?: string
  replyTo?: string
}

export type SendAppEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' }
  | { sent: false; reason: 'failed'; error: string }

function logClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  return createClient(url, key)
}

async function writeLog(
  templateName: string,
  recipient: string,
  status: 'sent' | 'suppressed' | 'failed',
  errorMessage?: string,
) {
  const supabase = logClient()
  if (!supabase) return
  const { error } = await supabase.from('email_send_log').insert({
    message_id: null,
    template_name: templateName,
    recipient_email: recipient,
    status,
    error_message: errorMessage ?? null,
  })
  if (error) {
    console.error('Failed to write email_send_log', {
      template_name: templateName,
      status,
      code: error.code,
      message: error.message,
    })
  }
}

export async function sendAppEmail(
  templateName: string,
  to: string,
  options: SendAppEmailOptions = {},
): Promise<SendAppEmailResult> {
  try {
    const result = await sendTemplateEmail(templateName, to, {
      templateData: options.templateData as Record<string, any> | undefined,
      idempotencyKey: options.idempotencyKey,
      replyTo: options.replyTo,
    })

    if (result.sent) {
      await writeLog(templateName, to, 'sent')
      return { sent: true }
    }

    await writeLog(templateName, to, 'suppressed', 'Recipient suppressed by managed email delivery')
    return { sent: false, reason: 'recipient_suppressed' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('App email send failed', { template_name: templateName, message })
    await writeLog(templateName, to, 'failed', message.slice(0, 1000))
    return { sent: false, reason: 'failed', error: message }
  }
}
