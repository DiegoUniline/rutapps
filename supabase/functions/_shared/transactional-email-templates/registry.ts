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

export const TEMPLATES: Record<string, TemplateEntry> = {
  'cobro-recibo': cobroRecibo,
  'admin-billing-alert': adminBillingAlert,
}
