export interface CommissionPerson {
  id: string;
  person_type: 'internal' | 'partner';
  partner_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  manager_id: string | null;
  is_active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionCompany {
  id: string;
  nombre: string;
  created_at: string;
}

export interface CommissionAttribution {
  id: string;
  empresa_id: string;
  captured_by_id: string | null;
  managed_by_id: string | null;
  channel: string;
  captured_at: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommissionAuditEntry {
  id: string;
  entity_type: 'person' | 'client_attribution';
  entity_id: string;
  action: 'created' | 'updated' | 'deleted';
  previous_data: unknown;
  new_data: unknown;
  reason: string | null;
  changed_by: string | null;
  created_at: string;
}

export interface CommissionAdminData {
  people: CommissionPerson[];
  companies: CommissionCompany[];
  attributions: CommissionAttribution[];
  audit: CommissionAuditEntry[];
}
