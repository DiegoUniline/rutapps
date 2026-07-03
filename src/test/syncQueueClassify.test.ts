import { describe, it, expect } from 'vitest';
import { classifySyncError, SYNC_MAX_RETRIES } from '@/lib/syncErrorClassify';

const MAX = SYNC_MAX_RETRIES;

describe('classifySyncError — cerebro de la cola offline', () => {
  describe('TRANSITORIO (falla de red) — una venta nunca se pierde por mala señal', () => {
    it('sin código + "Failed to fetch" → transient', () => {
      expect(classifySyncError({ err: { message: 'Failed to fetch' }, table: 'ventas', newRetries: 1 })).toBe('transient');
    });
    it('sin código + status 500 → transient', () => {
      expect(classifySyncError({ err: { status: 500 }, table: 'cobros', newRetries: 3 })).toBe('transient');
    });
    it('sin código + status 0 (offline) → transient', () => {
      expect(classifySyncError({ err: { status: 0 }, table: 'ventas', newRetries: 1 })).toBe('transient');
    });
    it('sin código y sin status → transient', () => {
      expect(classifySyncError({ err: {}, table: 'ventas', newRetries: 1 })).toBe('transient');
    });
    it('status 408 y 429 → transient', () => {
      expect(classifySyncError({ err: { status: 408 }, table: 'ventas', newRetries: 1 })).toBe('transient');
      expect(classifySyncError({ err: { status: 429 }, table: 'ventas', newRetries: 1 })).toBe('transient');
    });
    it('status anidado en originalError → transient', () => {
      expect(classifySyncError({ err: { originalError: { status: 503 } }, table: 'ventas', newRetries: 1 })).toBe('transient');
    });
    it('GARANTÍA: falla de red NUNCA cae a dead-letter, ni con miles de reintentos', () => {
      expect(classifySyncError({ err: { message: 'network error' }, table: 'ventas', newRetries: 9999 })).toBe('transient');
    });
  });

  describe('DIFERIBLE (esperar al padre) — con tope para no girar por siempre', () => {
    it('FK faltante (23503) con reintentos disponibles → defer', () => {
      expect(classifySyncError({ err: { code: '23503' }, table: 'venta_lineas', newRetries: 1 })).toBe('defer');
    });
    it('FK faltante que agotó los reintentos → dead-letter (huérfano)', () => {
      expect(classifySyncError({ err: { code: '23503' }, table: 'venta_lineas', newRetries: MAX })).toBe('dead-letter');
    });
    it('fila destino aún no existe (ROW_NOT_YET) → defer', () => {
      expect(classifySyncError({ err: { code: 'ROW_NOT_YET' }, table: 'ventas', newRetries: 1 })).toBe('defer');
    });
    it('RLS (42501) en tabla hija → defer', () => {
      expect(classifySyncError({ err: { code: '42501' }, table: 'cobro_aplicaciones', newRetries: 1 })).toBe('defer');
    });
    it('RLS (42501) en tabla NO hija → no es diferible → retry', () => {
      expect(classifySyncError({ err: { code: '42501' }, table: 'ventas', newRetries: 1 })).toBe('retry');
    });
    it('enum inválido de devoluciones (22P02) → defer', () => {
      expect(classifySyncError({ err: { code: '22P02' }, table: 'devoluciones', newRetries: 1 })).toBe('defer');
    });
    it('check-constraint de devoluciones (23514) → defer', () => {
      expect(classifySyncError({ err: { code: '23514' }, table: 'devolucion_lineas', newRetries: 1 })).toBe('defer');
    });
  });

  describe('DEAD-LETTER directo', () => {
    it('tabla inexistente (42P01) → dead-letter', () => {
      expect(classifySyncError({ err: { code: '42P01' }, table: 'ventas', newRetries: 1 })).toBe('dead-letter');
    });
    it('recurso no encontrado (PGRST116) → dead-letter', () => {
      expect(classifySyncError({ err: { code: 'PGRST116' }, table: 'ventas', newRetries: 1 })).toBe('dead-letter');
    });
  });

  describe('RETRY (error de dato desconocido, con reintentos)', () => {
    it('conflicto de clave (23505) → retry', () => {
      expect(classifySyncError({ err: { code: '23505' }, table: 'ventas', newRetries: 1 })).toBe('retry');
    });
    it('violación not-null (23502) con reintentos → retry', () => {
      expect(classifySyncError({ err: { code: '23502' }, table: 'ventas', newRetries: 1 })).toBe('retry');
    });
    it('error de dato que agota los reintentos → dead-letter', () => {
      expect(classifySyncError({ err: { code: '23502' }, table: 'ventas', newRetries: MAX })).toBe('dead-letter');
    });
  });
});
