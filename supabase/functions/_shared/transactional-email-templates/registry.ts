/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: any) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: (data: any) => string
}

import { template as cobroRecibo } from './cobro-recibo.tsx'
import { template as adminBillingAlert } from './admin-billing-alert.tsx'
import { template as clientBillingStatus } from './client-billing-status.tsx'
import { template as cfdiEnvio } from './cfdi-envio.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'cobro-recibo': cobroRecibo,
  'admin-billing-alert': adminBillingAlert,
  'client-billing-status': clientBillingStatus,
  'cfdi-envio': cfdiEnvio,
}
