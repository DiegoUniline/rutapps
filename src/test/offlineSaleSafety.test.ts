import { describe, expect, it } from 'vitest';
import { getPromotionReadinessCopy, isPromotionCacheUsable } from '@/lib/offlinePromotionSafety';
import { mergeLocalRow } from '@/lib/localRowMerge';
import {
  isPublicGeneralClient,
  normalizePublicGeneralName,
  selectPublicGeneralClient,
} from '@/lib/publicGeneralClient';

describe('seguridad de promociones offline', () => {
  it('acepta cero promociones cuando existe una sincronización exitosa', () => {
    expect(isPromotionCacheUsable({ cacheReadFailed: false, cachedRowCount: 0, lastSuccessfulSyncAt: 123 })).toBe(true);
  });

  it('bloquea cero filas cuando nunca se descargó la tabla', () => {
    expect(isPromotionCacheUsable({ cacheReadFailed: false, cachedRowCount: 0, lastSuccessfulSyncAt: null })).toBe(false);
  });

  it('bloquea una lectura rota y acepta filas legacy comprobables', () => {
    expect(isPromotionCacheUsable({ cacheReadFailed: true, cachedRowCount: 4, lastSuccessfulSyncAt: 123 })).toBe(false);
    expect(isPromotionCacheUsable({ cacheReadFailed: false, cachedRowCount: 1, lastSuccessfulSyncAt: null })).toBe(true);
  });

  it('explica cómo recuperar una caché que no está preparada', () => {
    expect(getPromotionReadinessCopy({ status: 'error', promotionCount: 0, isOnline: false })).toEqual({
      tone: 'warning',
      title: 'Promociones sin preparar',
      description: 'Conéctate a internet, vuelve a Ruta, pulsa Sincronizar y después regresa a esta venta.',
    });
  });

  it('confirma explícitamente que cero promociones es un estado válido', () => {
    expect(getPromotionReadinessCopy({ status: 'ready', promotionCount: 0, isOnline: true }).description)
      .toContain('Puedes continuar');
  });
});

describe('identidad de Público general', () => {
  it('normaliza acentos, mayúsculas y espacios', () => {
    expect(normalizePublicGeneralName('  PÚBLICO   General ')).toBe('publico general');
    expect(isPublicGeneralClient({ nombre: 'Publico general' })).toBe(true);
  });

  it('prioriza la identidad marcada y nunca cruza empresas', () => {
    const selected = selectPublicGeneralClient([
      { id: 'legacy', empresa_id: 'empresa-a', nombre: 'Público general', status: 'activo', created_at: '2025-01-01' },
      { id: 'system', empresa_id: 'empresa-a', nombre: 'Cliente mostrador', status: 'activo', es_publico_general: true, created_at: '2026-01-01' },
      { id: 'other', empresa_id: 'empresa-b', nombre: 'Público general', status: 'activo', es_publico_general: true },
    ], 'empresa-a');
    expect(selected?.id).toBe('system');
  });

  it('no utiliza un cliente de sistema inactivo', () => {
    expect(selectPublicGeneralClient([
      { id: 'inactive', empresa_id: 'empresa-a', nombre: 'Público general', status: 'inactivo', es_publico_general: true },
    ], 'empresa-a')).toBeNull();
  });
});

describe('reparación local de una venta pendiente', () => {
  it('agrega cliente_id sin perder folio, total ni saldo', () => {
    const repaired = mergeLocalRow(
      { id: 'venta-1', folio: 'VTA-0008', total: 207.70, saldo_pendiente: 207.70 },
      { cliente_id: 'publico-general' },
    );

    expect(repaired).toEqual({
      id: 'venta-1',
      folio: 'VTA-0008',
      total: 207.70,
      saldo_pendiente: 207.70,
      cliente_id: 'publico-general',
    });
  });
});
