/**
 * Verify that synced items actually exist on the server.
 * This gives the seller confidence that desktop can see their data.
 */
import { supabase } from '@/lib/supabase';
import { offlineDb } from './offlineDb';

interface SyncRecord {
  table: string;
  recordId: string;
  syncedAt: number;
}

const VERIFY_STORE_KEY = 'uniline_last_synced_records';

// Save which records were just synced
export function markAsSynced(table: string, recordId: string) {
  try {
    const existing: SyncRecord[] = JSON.parse(localStorage.getItem(VERIFY_STORE_KEY) || '[]');
    // Keep only last 50 records
    const updated = [...existing, { table, recordId, syncedAt: Date.now() }].slice(-50);
    localStorage.setItem(VERIFY_STORE_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

// Verify the last synced records exist on the server
export async function verifySyncedItems(empresaId: string): Promise<boolean> {
  try {
    const records: SyncRecord[] = JSON.parse(localStorage.getItem(VERIFY_STORE_KEY) || '[]');
    if (records.length === 0) return true; // Nothing to verify

    // Check a sample of recent records (up to 5)
    const recent = records.slice(-5);
    
    for (const record of recent) {
      const { data, error } = await (supabase.from as any)(record.table)
        .select('id')
        .eq('id', record.recordId)
        .maybeSingle();
      
      if (error || !data) {
        return false; // At least one record not found on server
      }
    }

    return true; // All verified
  } catch {
    return false;
  }
}

// Get last sync verification info
export function getLastSyncedRecords(): SyncRecord[] {
  try {
    return JSON.parse(localStorage.getItem(VERIFY_STORE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function clearSyncedRecords() {
  localStorage.removeItem(VERIFY_STORE_KEY);
}
