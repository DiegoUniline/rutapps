import { describe, it, expect } from 'vitest';
import { translateError, mensajeError, esMensajePropio } from '@/lib/errorTranslator';

describe('traductor de errores', () => {
  it('registro: errores de Supabase Auth en español y específicos', () => {
    expect(translateError(new Error('User already registered')).title).toBe('Correo ya registrado');
    expect(translateError({ message: 'Database error saving new user' }).title).toBe('No se pudo crear la cuenta');
    expect(translateError('duplicate key value violates unique constraint "empresas_telefono_unique"').title).toBe('Teléfono ya registrado');
    expect(translateError(new Error('Invalid login credentials')).title).toBe('Correo o contraseña incorrectos');
    expect(translateError(new Error('Email not confirmed')).title).toBe('Correo sin confirmar');
  });

  it('mensaje propio (RAISE EXCEPTION / throw en español) se muestra tal cual', () => {
    const t = translateError({ code: 'P0001', message: 'No hay existencia suficiente de Coca 600ml en Ruta 1' });
    expect(t.message).toBe('No hay existencia suficiente de Coca 600ml en Ruta 1');
    expect(translateError(new Error('La venta ya está cancelada')).message).toBe('La venta ya está cancelada');
    expect(mensajeError(new Error('Selecciona un almacén'))).toBe('Selecciona un almacén');
  });

  it('errores técnicos no se muestran crudos', () => {
    expect(esMensajePropio({}, 'Failed to fetch')).toBe(false);
    expect(esMensajePropio({}, 'null value in column "empresa_id" violates not-null constraint')).toBe(false);
    expect(esMensajePropio({}, 'Edge Function returned a non-2xx status code')).toBe(false);
    expect(translateError(new Error('Failed to fetch')).title).toBe('No pudimos conectar con el servidor');
    expect(translateError(new Error('duplicate key value violates unique constraint "x"')).title).toBe('Registro duplicado');
    expect(translateError(new Error('something odd')).title).toBe('Algo salió mal');
  });

  it('mensajeError arma una línea para el toast', () => {
    expect(mensajeError(new Error('User already registered'))).toBe('Correo ya registrado. Ya existe una cuenta con este correo electrónico.');
  });
});
