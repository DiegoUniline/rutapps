export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      ajustes_inventario: {
        Row: {
          almacen_id: string | null
          batch_id: string | null
          cantidad_anterior: number
          cantidad_nueva: number
          created_at: string
          diferencia: number
          empresa_id: string
          fecha: string
          id: string
          motivo: string | null
          producto_id: string | null
          user_id: string
        }
        Insert: {
          almacen_id?: string | null
          batch_id?: string | null
          cantidad_anterior?: number
          cantidad_nueva?: number
          created_at?: string
          diferencia?: number
          empresa_id: string
          fecha?: string
          id?: string
          motivo?: string | null
          producto_id?: string | null
          user_id: string
        }
        Update: {
          almacen_id?: string | null
          batch_id?: string | null
          cantidad_anterior?: number
          cantidad_nueva?: number
          created_at?: string
          diferencia?: number
          empresa_id?: string
          fecha?: string
          id?: string
          motivo?: string | null
          producto_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ajustes_inventario_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_inventario_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ajustes_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      almacenes: {
        Row: {
          activo: boolean
          created_at: string
          direccion: string | null
          empresa_id: string
          es_merma: boolean
          gps_lat: number | null
          gps_lng: number | null
          id: string
          nombre: string
          tipo: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          direccion?: string | null
          empresa_id: string
          es_merma?: boolean
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          nombre: string
          tipo?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          direccion?: string | null
          empresa_id?: string
          es_merma?: boolean
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          nombre?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "almacenes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_entradas: {
        Row: {
          auditoria_linea_id: string
          cantidad: number
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          auditoria_linea_id: string
          cantidad?: number
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          auditoria_linea_id?: string
          cantidad?: number
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_entradas_auditoria_linea_id_fkey"
            columns: ["auditoria_linea_id"]
            isOneToOne: false
            referencedRelation: "auditoria_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_escaneos: {
        Row: {
          auditoria_id: string
          cantidad: number
          created_at: string
          escaneado_at: string
          escaneado_por: string
          id: string
          linea_id: string
        }
        Insert: {
          auditoria_id: string
          cantidad?: number
          created_at?: string
          escaneado_at?: string
          escaneado_por?: string
          id?: string
          linea_id: string
        }
        Update: {
          auditoria_id?: string
          cantidad?: number
          created_at?: string
          escaneado_at?: string
          escaneado_por?: string
          id?: string
          linea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_escaneos_auditoria_id_fkey"
            columns: ["auditoria_id"]
            isOneToOne: false
            referencedRelation: "auditorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_escaneos_linea_id_fkey"
            columns: ["linea_id"]
            isOneToOne: false
            referencedRelation: "auditoria_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      auditoria_lineas: {
        Row: {
          ajustado: boolean
          auditoria_id: string
          cantidad_esperada: number
          cantidad_real: number | null
          cerrada: boolean
          cerrada_at: string | null
          created_at: string
          diferencia: number
          id: string
          notas: string | null
          producto_id: string | null
        }
        Insert: {
          ajustado?: boolean
          auditoria_id: string
          cantidad_esperada?: number
          cantidad_real?: number | null
          cerrada?: boolean
          cerrada_at?: string | null
          created_at?: string
          diferencia?: number
          id?: string
          notas?: string | null
          producto_id?: string | null
        }
        Update: {
          ajustado?: boolean
          auditoria_id?: string
          cantidad_esperada?: number
          cantidad_real?: number | null
          cerrada?: boolean
          cerrada_at?: string | null
          created_at?: string
          diferencia?: number
          id?: string
          notas?: string | null
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_lineas_auditoria_id_fkey"
            columns: ["auditoria_id"]
            isOneToOne: false
            referencedRelation: "auditorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditoria_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      auditorias: {
        Row: {
          almacen_id: string | null
          aprobado_por: string | null
          cerrada_at: string | null
          cerrada_por: string | null
          created_at: string
          empresa_id: string
          fecha: string
          fecha_aprobacion: string | null
          filtro_tipo: string
          filtro_valor: string | null
          id: string
          nombre: string
          notas: string | null
          notas_supervisor: string | null
          status: Database["public"]["Enums"]["status_auditoria"]
          user_id: string
        }
        Insert: {
          almacen_id?: string | null
          aprobado_por?: string | null
          cerrada_at?: string | null
          cerrada_por?: string | null
          created_at?: string
          empresa_id: string
          fecha?: string
          fecha_aprobacion?: string | null
          filtro_tipo?: string
          filtro_valor?: string | null
          id?: string
          nombre: string
          notas?: string | null
          notas_supervisor?: string | null
          status?: Database["public"]["Enums"]["status_auditoria"]
          user_id: string
        }
        Update: {
          almacen_id?: string | null
          aprobado_por?: string | null
          cerrada_at?: string | null
          cerrada_por?: string | null
          created_at?: string
          empresa_id?: string
          fecha?: string
          fecha_aprobacion?: string | null
          filtro_tipo?: string
          filtro_valor?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          notas_supervisor?: string | null
          status?: Database["public"]["Enums"]["status_auditoria"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditorias_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditorias_aprobado_por_profiles_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auditorias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_message_templates: {
        Row: {
          activo: boolean
          campos: Json
          created_at: string
          emoji: string
          encabezado: string | null
          id: string
          pie_mensaje: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          campos?: Json
          created_at?: string
          emoji?: string
          encabezado?: string | null
          id?: string
          pie_mensaje?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          campos?: Json
          created_at?: string
          emoji?: string
          encabezado?: string | null
          id?: string
          pie_mensaje?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_notifications: {
        Row: {
          channel: string
          created_at: string
          customer_email: string
          customer_phone: string | null
          error_detalle: string | null
          id: string
          mensaje: string | null
          monto_centavos: number | null
          status: string
          stripe_invoice_id: string | null
          stripe_invoice_url: string | null
          tipo: string
        }
        Insert: {
          channel?: string
          created_at?: string
          customer_email: string
          customer_phone?: string | null
          error_detalle?: string | null
          id?: string
          mensaje?: string | null
          monto_centavos?: number | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_invoice_url?: string | null
          tipo?: string
        }
        Update: {
          channel?: string
          created_at?: string
          customer_email?: string
          customer_phone?: string | null
          error_detalle?: string | null
          id?: string
          mensaje?: string | null
          monto_centavos?: number | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_invoice_url?: string | null
          tipo?: string
        }
        Relationships: []
      }
      broadcast_messages: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mensaje: string
          tipo: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mensaje: string
          tipo?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mensaje?: string
          tipo?: string
        }
        Relationships: []
      }
      broadcast_reads: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "broadcast_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      caja_movimientos: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          monto: number
          motivo: string | null
          tipo: string
          turno_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          monto: number
          motivo?: string | null
          tipo: string
          turno_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          monto?: number
          motivo?: string | null
          tipo?: string
          turno_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caja_movimientos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caja_movimientos_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "caja_turnos"
            referencedColumns: ["id"]
          },
        ]
      }
      caja_turnos: {
        Row: {
          abierto_at: string
          arqueo_denominaciones: Json | null
          caja_nombre: string
          cajero_id: string
          cerrado_at: string | null
          cerrado_por: string | null
          created_at: string
          diferencia: number | null
          empresa_id: string
          fondo_inicial: number
          id: string
          notas_apertura: string | null
          notas_cierre: string | null
          status: string
          total_efectivo_contado: number | null
          total_efectivo_esperado: number | null
          total_otros_contado: number | null
          total_otros_esperado: number | null
          total_tarjeta_contado: number | null
          total_tarjeta_esperado: number | null
          total_transferencia_contado: number | null
          total_transferencia_esperado: number | null
          updated_at: string
        }
        Insert: {
          abierto_at?: string
          arqueo_denominaciones?: Json | null
          caja_nombre?: string
          cajero_id: string
          cerrado_at?: string | null
          cerrado_por?: string | null
          created_at?: string
          diferencia?: number | null
          empresa_id: string
          fondo_inicial?: number
          id?: string
          notas_apertura?: string | null
          notas_cierre?: string | null
          status?: string
          total_efectivo_contado?: number | null
          total_efectivo_esperado?: number | null
          total_otros_contado?: number | null
          total_otros_esperado?: number | null
          total_tarjeta_contado?: number | null
          total_tarjeta_esperado?: number | null
          total_transferencia_contado?: number | null
          total_transferencia_esperado?: number | null
          updated_at?: string
        }
        Update: {
          abierto_at?: string
          arqueo_denominaciones?: Json | null
          caja_nombre?: string
          cajero_id?: string
          cerrado_at?: string | null
          cerrado_por?: string | null
          created_at?: string
          diferencia?: number | null
          empresa_id?: string
          fondo_inicial?: number
          id?: string
          notas_apertura?: string | null
          notas_cierre?: string | null
          status?: string
          total_efectivo_contado?: number | null
          total_efectivo_esperado?: number | null
          total_otros_contado?: number | null
          total_otros_esperado?: number | null
          total_tarjeta_contado?: number | null
          total_tarjeta_esperado?: number | null
          total_transferencia_contado?: number | null
          total_transferencia_esperado?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "caja_turnos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_requests: {
        Row: {
          cancelled: boolean
          created_at: string
          discount_accepted: boolean
          empresa_id: string
          id: string
          offered_discount: boolean
          reason: string
          reason_detail: string | null
          user_id: string
        }
        Insert: {
          cancelled?: boolean
          created_at?: string
          discount_accepted?: boolean
          empresa_id: string
          id?: string
          offered_discount?: boolean
          reason?: string
          reason_detail?: string | null
          user_id: string
        }
        Update: {
          cancelled?: boolean
          created_at?: string
          discount_accepted?: boolean
          empresa_id?: string
          id?: string
          offered_discount?: boolean
          reason?: string
          reason_detail?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_requests_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      carga_lineas: {
        Row: {
          cantidad_cargada: number
          cantidad_devuelta: number
          cantidad_vendida: number
          carga_id: string
          created_at: string
          id: string
          producto_id: string | null
        }
        Insert: {
          cantidad_cargada?: number
          cantidad_devuelta?: number
          cantidad_vendida?: number
          carga_id: string
          created_at?: string
          id?: string
          producto_id?: string | null
        }
        Update: {
          cantidad_cargada?: number
          cantidad_devuelta?: number
          cantidad_vendida?: number
          carga_id?: string
          created_at?: string
          id?: string
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "carga_lineas_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carga_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      carga_pedidos: {
        Row: {
          carga_id: string
          created_at: string
          id: string
          venta_id: string
        }
        Insert: {
          carga_id: string
          created_at?: string
          id?: string
          venta_id: string
        }
        Update: {
          carga_id?: string
          created_at?: string
          id?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carga_pedidos_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carga_pedidos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      cargas: {
        Row: {
          almacen_destino_id: string | null
          almacen_id: string | null
          created_at: string
          empresa_id: string
          fecha: string
          id: string
          notas: string | null
          repartidor_id: string | null
          status: Database["public"]["Enums"]["status_carga"]
          vendedor_id: string | null
        }
        Insert: {
          almacen_destino_id?: string | null
          almacen_id?: string | null
          created_at?: string
          empresa_id: string
          fecha?: string
          id?: string
          notas?: string | null
          repartidor_id?: string | null
          status?: Database["public"]["Enums"]["status_carga"]
          vendedor_id?: string | null
        }
        Update: {
          almacen_destino_id?: string | null
          almacen_id?: string | null
          created_at?: string
          empresa_id?: string
          fecha?: string
          id?: string
          notas?: string | null
          repartidor_id?: string | null
          status?: Database["public"]["Enums"]["status_carga"]
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cargas_almacen_destino_id_fkey"
            columns: ["almacen_destino_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_repartidor_id_profiles_fkey"
            columns: ["repartidor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_vendedor_id_profiles_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cat_forma_pago: {
        Row: {
          activo: boolean | null
          clave: string
          descripcion: string
          id: string
        }
        Insert: {
          activo?: boolean | null
          clave: string
          descripcion: string
          id?: string
        }
        Update: {
          activo?: boolean | null
          clave?: string
          descripcion?: string
          id?: string
        }
        Relationships: []
      }
      cat_metodo_pago: {
        Row: {
          activo: boolean | null
          clave: string
          descripcion: string
          id: string
        }
        Insert: {
          activo?: boolean | null
          clave: string
          descripcion: string
          id?: string
        }
        Update: {
          activo?: boolean | null
          clave?: string
          descripcion?: string
          id?: string
        }
        Relationships: []
      }
      cat_moneda: {
        Row: {
          activo: boolean | null
          clave: string
          descripcion: string
          id: string
        }
        Insert: {
          activo?: boolean | null
          clave: string
          descripcion: string
          id?: string
        }
        Update: {
          activo?: boolean | null
          clave?: string
          descripcion?: string
          id?: string
        }
        Relationships: []
      }
      cat_regimen_fiscal: {
        Row: {
          activo: boolean | null
          clave: string
          descripcion: string
          id: string
          persona_fisica: boolean | null
          persona_moral: boolean | null
        }
        Insert: {
          activo?: boolean | null
          clave: string
          descripcion: string
          id?: string
          persona_fisica?: boolean | null
          persona_moral?: boolean | null
        }
        Update: {
          activo?: boolean | null
          clave?: string
          descripcion?: string
          id?: string
          persona_fisica?: boolean | null
          persona_moral?: boolean | null
        }
        Relationships: []
      }
      cat_tipo_comprobante: {
        Row: {
          activo: boolean | null
          clave: string
          descripcion: string
          id: string
        }
        Insert: {
          activo?: boolean | null
          clave: string
          descripcion: string
          id?: string
        }
        Update: {
          activo?: boolean | null
          clave?: string
          descripcion?: string
          id?: string
        }
        Relationships: []
      }
      cat_uso_cfdi: {
        Row: {
          activo: boolean | null
          clave: string
          descripcion: string
          id: string
          persona_fisica: boolean | null
          persona_moral: boolean | null
        }
        Insert: {
          activo?: boolean | null
          clave: string
          descripcion: string
          id?: string
          persona_fisica?: boolean | null
          persona_moral?: boolean | null
        }
        Update: {
          activo?: boolean | null
          clave?: string
          descripcion?: string
          id?: string
          persona_fisica?: boolean | null
          persona_moral?: boolean | null
        }
        Relationships: []
      }
      cfdi_lineas: {
        Row: {
          cantidad: number
          cfdi_id: string
          created_at: string
          descripcion: string
          id: string
          ieps_monto: number
          ieps_pct: number
          iva_monto: number
          iva_pct: number
          precio_unitario: number
          product_code: string
          producto_id: string | null
          subtotal: number
          total: number
          unit_code: string
          unit_name: string
          venta_linea_id: string | null
        }
        Insert: {
          cantidad?: number
          cfdi_id: string
          created_at?: string
          descripcion?: string
          id?: string
          ieps_monto?: number
          ieps_pct?: number
          iva_monto?: number
          iva_pct?: number
          precio_unitario?: number
          product_code?: string
          producto_id?: string | null
          subtotal?: number
          total?: number
          unit_code?: string
          unit_name?: string
          venta_linea_id?: string | null
        }
        Update: {
          cantidad?: number
          cfdi_id?: string
          created_at?: string
          descripcion?: string
          id?: string
          ieps_monto?: number
          ieps_pct?: number
          iva_monto?: number
          iva_pct?: number
          precio_unitario?: number
          product_code?: string
          producto_id?: string | null
          subtotal?: number
          total?: number
          unit_code?: string
          unit_name?: string
          venta_linea_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_lineas_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_lineas_venta_linea_id_fkey"
            columns: ["venta_linea_id"]
            isOneToOne: false
            referencedRelation: "venta_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_pago_documentos: {
        Row: {
          cfdi_id: string | null
          cfdi_pago_id: string
          cfdi_relacionado_uuid: string
          created_at: string
          empresa_id: string
          folio_dr: string | null
          id: string
          imp_pagado: number
          imp_saldo_ant: number
          imp_saldo_insoluto: number
          iva_trasladado_dr: number
          metodo_pago_dr: string | null
          moneda_dr: string
          num_parcialidad: number
          objeto_imp_dr: string | null
          serie_dr: string | null
          tipo_cambio_dr: number
          venta_id: string | null
        }
        Insert: {
          cfdi_id?: string | null
          cfdi_pago_id: string
          cfdi_relacionado_uuid: string
          created_at?: string
          empresa_id: string
          folio_dr?: string | null
          id?: string
          imp_pagado?: number
          imp_saldo_ant?: number
          imp_saldo_insoluto?: number
          iva_trasladado_dr?: number
          metodo_pago_dr?: string | null
          moneda_dr?: string
          num_parcialidad?: number
          objeto_imp_dr?: string | null
          serie_dr?: string | null
          tipo_cambio_dr?: number
          venta_id?: string | null
        }
        Update: {
          cfdi_id?: string | null
          cfdi_pago_id?: string
          cfdi_relacionado_uuid?: string
          created_at?: string
          empresa_id?: string
          folio_dr?: string | null
          id?: string
          imp_pagado?: number
          imp_saldo_ant?: number
          imp_saldo_insoluto?: number
          iva_trasladado_dr?: number
          metodo_pago_dr?: string | null
          moneda_dr?: string
          num_parcialidad?: number
          objeto_imp_dr?: string | null
          serie_dr?: string | null
          tipo_cambio_dr?: number
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_pago_documentos_cfdi_id_fkey"
            columns: ["cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_pago_documentos_cfdi_pago_id_fkey"
            columns: ["cfdi_pago_id"]
            isOneToOne: false
            referencedRelation: "cfdi_pagos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_pago_documentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_pago_documentos_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdi_pagos: {
        Row: {
          cadena_original: string | null
          cancel_date: string | null
          cancel_status: string | null
          cobro_id: string | null
          created_at: string
          cta_beneficiario: string | null
          cta_ordenante: string | null
          empresa_id: string
          enviado_a: string | null
          enviado_at: string | null
          error_detalle: string | null
          expedition_place: string | null
          facturama_id: string | null
          fecha_pago: string
          fecha_timbrado: string | null
          folio: string | null
          folio_fiscal: string | null
          forma_pago: string
          id: string
          moneda: string
          monto: number
          no_certificado_emisor: string | null
          no_certificado_sat: string | null
          nom_banco_ord_ext: string | null
          num_operacion: string | null
          pdf_url: string | null
          rfc_emisor_cta_ben: string | null
          rfc_emisor_cta_ord: string | null
          sello_cfdi: string | null
          sello_sat: string | null
          serie: string | null
          status: string
          tipo_cambio: number
          updated_at: string
          user_id: string
          xml_url: string | null
        }
        Insert: {
          cadena_original?: string | null
          cancel_date?: string | null
          cancel_status?: string | null
          cobro_id?: string | null
          created_at?: string
          cta_beneficiario?: string | null
          cta_ordenante?: string | null
          empresa_id: string
          enviado_a?: string | null
          enviado_at?: string | null
          error_detalle?: string | null
          expedition_place?: string | null
          facturama_id?: string | null
          fecha_pago: string
          fecha_timbrado?: string | null
          folio?: string | null
          folio_fiscal?: string | null
          forma_pago: string
          id?: string
          moneda?: string
          monto?: number
          no_certificado_emisor?: string | null
          no_certificado_sat?: string | null
          nom_banco_ord_ext?: string | null
          num_operacion?: string | null
          pdf_url?: string | null
          rfc_emisor_cta_ben?: string | null
          rfc_emisor_cta_ord?: string | null
          sello_cfdi?: string | null
          sello_sat?: string | null
          serie?: string | null
          status?: string
          tipo_cambio?: number
          updated_at?: string
          user_id: string
          xml_url?: string | null
        }
        Update: {
          cadena_original?: string | null
          cancel_date?: string | null
          cancel_status?: string | null
          cobro_id?: string | null
          created_at?: string
          cta_beneficiario?: string | null
          cta_ordenante?: string | null
          empresa_id?: string
          enviado_a?: string | null
          enviado_at?: string | null
          error_detalle?: string | null
          expedition_place?: string | null
          facturama_id?: string | null
          fecha_pago?: string
          fecha_timbrado?: string | null
          folio?: string | null
          folio_fiscal?: string | null
          forma_pago?: string
          id?: string
          moneda?: string
          monto?: number
          no_certificado_emisor?: string | null
          no_certificado_sat?: string | null
          nom_banco_ord_ext?: string | null
          num_operacion?: string | null
          pdf_url?: string | null
          rfc_emisor_cta_ben?: string | null
          rfc_emisor_cta_ord?: string | null
          sello_cfdi?: string | null
          sello_sat?: string | null
          serie?: string | null
          status?: string
          tipo_cambio?: number
          updated_at?: string
          user_id?: string
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cfdi_pagos_cobro_id_fkey"
            columns: ["cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdi_pagos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cfdis: {
        Row: {
          cadena_original: string | null
          cancel_date: string | null
          cancel_status: string | null
          cfdi_type: string
          created_at: string
          currency: string
          empresa_id: string
          enviado_a: string | null
          enviado_at: string | null
          error_detalle: string | null
          expedition_place: string | null
          facturama_id: string | null
          fecha_timbrado: string | null
          folio: string | null
          folio_fiscal: string | null
          id: string
          ieps_total: number
          iva_total: number
          no_certificado_emisor: string | null
          no_certificado_sat: string | null
          payment_form: string | null
          payment_method: string | null
          pdf_url: string | null
          receiver_cfdi_use: string | null
          receiver_fiscal_regime: string | null
          receiver_name: string | null
          receiver_rfc: string | null
          receiver_tax_zip_code: string | null
          retenciones_total: number
          sello_cfdi: string | null
          sello_sat: string | null
          serie: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          user_id: string
          venta_id: string | null
          xml_url: string | null
        }
        Insert: {
          cadena_original?: string | null
          cancel_date?: string | null
          cancel_status?: string | null
          cfdi_type?: string
          created_at?: string
          currency?: string
          empresa_id: string
          enviado_a?: string | null
          enviado_at?: string | null
          error_detalle?: string | null
          expedition_place?: string | null
          facturama_id?: string | null
          fecha_timbrado?: string | null
          folio?: string | null
          folio_fiscal?: string | null
          id?: string
          ieps_total?: number
          iva_total?: number
          no_certificado_emisor?: string | null
          no_certificado_sat?: string | null
          payment_form?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          receiver_cfdi_use?: string | null
          receiver_fiscal_regime?: string | null
          receiver_name?: string | null
          receiver_rfc?: string | null
          receiver_tax_zip_code?: string | null
          retenciones_total?: number
          sello_cfdi?: string | null
          sello_sat?: string | null
          serie?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id: string
          venta_id?: string | null
          xml_url?: string | null
        }
        Update: {
          cadena_original?: string | null
          cancel_date?: string | null
          cancel_status?: string | null
          cfdi_type?: string
          created_at?: string
          currency?: string
          empresa_id?: string
          enviado_a?: string | null
          enviado_at?: string | null
          error_detalle?: string | null
          expedition_place?: string | null
          facturama_id?: string | null
          fecha_timbrado?: string | null
          folio?: string | null
          folio_fiscal?: string | null
          id?: string
          ieps_total?: number
          iva_total?: number
          no_certificado_emisor?: string | null
          no_certificado_sat?: string | null
          payment_form?: string | null
          payment_method?: string | null
          pdf_url?: string | null
          receiver_cfdi_use?: string | null
          receiver_fiscal_regime?: string | null
          receiver_name?: string | null
          receiver_rfc?: string | null
          receiver_tax_zip_code?: string | null
          retenciones_total?: number
          sello_cfdi?: string | null
          sello_sat?: string | null
          serie?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          user_id?: string
          venta_id?: string | null
          xml_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cfdis_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cfdis_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      clasificaciones: {
        Row: {
          activo: boolean
          created_at: string
          empresa_id: string
          id: string
          imagen_url: string | null
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          imagen_url?: string | null
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          imagen_url?: string | null
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "clasificaciones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_orden_ruta: {
        Row: {
          cliente_id: string
          created_at: string
          dia: string | null
          empresa_id: string
          id: string
          orden: number
          origin_label: string | null
          origin_lat: number | null
          origin_lng: number | null
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          dia?: string | null
          empresa_id: string
          id?: string
          orden?: number
          origin_label?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          dia?: string | null
          empresa_id?: string
          id?: string
          orden?: number
          origin_label?: string | null
          origin_lat?: number | null
          origin_lng?: number | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_orden_ruta_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_orden_ruta_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente_pedido_sugerido: {
        Row: {
          cantidad: number
          cliente_id: string
          created_at: string
          id: string
          producto_id: string | null
        }
        Insert: {
          cantidad?: number
          cliente_id: string
          created_at?: string
          id?: string
          producto_id?: string | null
        }
        Update: {
          cantidad?: number
          cliente_id?: string
          created_at?: string
          id?: string
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_pedido_sugerido_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_pedido_sugerido_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          cobrador_id: string | null
          codigo: string | null
          colonia: string | null
          contacto: string | null
          cp: string | null
          created_at: string
          credito: boolean | null
          dia_visita: string[] | null
          dias_credito: number | null
          direccion: string | null
          email: string | null
          empresa_id: string
          facturama_correo_facturacion: string | null
          facturama_cp: string | null
          facturama_id: string | null
          facturama_razon_social: string | null
          facturama_regimen_fiscal: string | null
          facturama_rfc: string | null
          facturama_uso_cfdi: string | null
          fecha_alta: string | null
          foto_fachada_url: string | null
          foto_url: string | null
          frecuencia: Database["public"]["Enums"]["frecuencia_visita"] | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          lada: string | null
          limite_credito: number | null
          lista_id: string | null
          lista_precio_id: string | null
          nombre: string
          notas: string | null
          notas_fiscales: string | null
          orden: number | null
          portal_token: string | null
          recibir_notificaciones: boolean
          regimen_fiscal: string | null
          requiere_factura: boolean | null
          rfc: string | null
          rfc_validado_at: string | null
          rfc_validado_detalle: Json | null
          rfc_validado_status: string | null
          status: Database["public"]["Enums"]["status_cliente"] | null
          tarifa_id: string | null
          telefono: string | null
          uso_cfdi: string | null
          vendedor_id: string | null
          zona_id: string | null
        }
        Insert: {
          cobrador_id?: string | null
          codigo?: string | null
          colonia?: string | null
          contacto?: string | null
          cp?: string | null
          created_at?: string
          credito?: boolean | null
          dia_visita?: string[] | null
          dias_credito?: number | null
          direccion?: string | null
          email?: string | null
          empresa_id: string
          facturama_correo_facturacion?: string | null
          facturama_cp?: string | null
          facturama_id?: string | null
          facturama_razon_social?: string | null
          facturama_regimen_fiscal?: string | null
          facturama_rfc?: string | null
          facturama_uso_cfdi?: string | null
          fecha_alta?: string | null
          foto_fachada_url?: string | null
          foto_url?: string | null
          frecuencia?: Database["public"]["Enums"]["frecuencia_visita"] | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          lada?: string | null
          limite_credito?: number | null
          lista_id?: string | null
          lista_precio_id?: string | null
          nombre: string
          notas?: string | null
          notas_fiscales?: string | null
          orden?: number | null
          portal_token?: string | null
          recibir_notificaciones?: boolean
          regimen_fiscal?: string | null
          requiere_factura?: boolean | null
          rfc?: string | null
          rfc_validado_at?: string | null
          rfc_validado_detalle?: Json | null
          rfc_validado_status?: string | null
          status?: Database["public"]["Enums"]["status_cliente"] | null
          tarifa_id?: string | null
          telefono?: string | null
          uso_cfdi?: string | null
          vendedor_id?: string | null
          zona_id?: string | null
        }
        Update: {
          cobrador_id?: string | null
          codigo?: string | null
          colonia?: string | null
          contacto?: string | null
          cp?: string | null
          created_at?: string
          credito?: boolean | null
          dia_visita?: string[] | null
          dias_credito?: number | null
          direccion?: string | null
          email?: string | null
          empresa_id?: string
          facturama_correo_facturacion?: string | null
          facturama_cp?: string | null
          facturama_id?: string | null
          facturama_razon_social?: string | null
          facturama_regimen_fiscal?: string | null
          facturama_rfc?: string | null
          facturama_uso_cfdi?: string | null
          fecha_alta?: string | null
          foto_fachada_url?: string | null
          foto_url?: string | null
          frecuencia?: Database["public"]["Enums"]["frecuencia_visita"] | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          lada?: string | null
          limite_credito?: number | null
          lista_id?: string | null
          lista_precio_id?: string | null
          nombre?: string
          notas?: string | null
          notas_fiscales?: string | null
          orden?: number | null
          portal_token?: string | null
          recibir_notificaciones?: boolean
          regimen_fiscal?: string | null
          requiere_factura?: boolean | null
          rfc?: string | null
          rfc_validado_at?: string | null
          rfc_validado_detalle?: Json | null
          rfc_validado_status?: string | null
          status?: Database["public"]["Enums"]["status_cliente"] | null
          tarifa_id?: string | null
          telefono?: string | null
          uso_cfdi?: string | null
          vendedor_id?: string | null
          zona_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_cobrador_id_profiles_fkey"
            columns: ["cobrador_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "listas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_lista_precio_id_fkey"
            columns: ["lista_precio_id"]
            isOneToOne: false
            referencedRelation: "lista_precios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "tarifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_vendedor_id_profiles_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_zona_id_fkey"
            columns: ["zona_id"]
            isOneToOne: false
            referencedRelation: "zonas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobradores: {
        Row: {
          activo: boolean
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          telefono: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          telefono?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobradores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobro_aplicaciones: {
        Row: {
          cobro_id: string
          created_at: string
          id: string
          monto_aplicado: number
          venta_id: string
        }
        Insert: {
          cobro_id: string
          created_at?: string
          id?: string
          monto_aplicado?: number
          venta_id: string
        }
        Update: {
          cobro_id?: string
          created_at?: string
          id?: string
          monto_aplicado?: number
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobro_aplicaciones_cobro_id_fkey"
            columns: ["cobro_id"]
            isOneToOne: false
            referencedRelation: "cobros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobro_aplicaciones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobro_reintentos: {
        Row: {
          created_at: string
          empresa_id: string
          estado: string
          factura_id: string
          id: string
          intento_num: number
          procesado_at: string | null
          proxima_fecha: string
          stripe_invoice_id: string | null
          ultimo_error: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          estado?: string
          factura_id: string
          id?: string
          intento_num: number
          procesado_at?: string | null
          proxima_fecha: string
          stripe_invoice_id?: string | null
          ultimo_error?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          estado?: string
          factura_id?: string
          id?: string
          intento_num?: number
          procesado_at?: string | null
          proxima_fecha?: string
          stripe_invoice_id?: string | null
          ultimo_error?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobro_reintentos_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: false
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
        ]
      }
      cobros: {
        Row: {
          cliente_id: string
          created_at: string
          empresa_id: string
          fecha: string
          id: string
          metodo_pago: string
          monto: number
          notas: string | null
          notif_email_status: string | null
          notif_error: string | null
          notif_wa_status: string | null
          referencia: string | null
          status: string
          user_id: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          empresa_id: string
          fecha?: string
          id?: string
          metodo_pago?: string
          monto?: number
          notas?: string | null
          notif_email_status?: string | null
          notif_error?: string | null
          notif_wa_status?: string | null
          referencia?: string | null
          status?: string
          user_id: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          empresa_id?: string
          fecha?: string
          id?: string
          metodo_pago?: string
          monto?: number
          notas?: string | null
          notif_email_status?: string | null
          notif_error?: string | null
          notif_wa_status?: string | null
          referencia?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobros_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobros_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      comision_esquemas: {
        Row: {
          activo: boolean
          base: string
          config: Json
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          periodo: string
          tipo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          base: string
          config?: Json
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          periodo: string
          tipo: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          base?: string
          config?: Json
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          periodo?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comision_esquemas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      compra_lineas: {
        Row: {
          cantidad: number
          cantidad_recibida: number
          compra_id: string
          created_at: string
          factor_conversion: number
          id: string
          piezas_total: number | null
          precio_unitario: number
          producto_id: string | null
          subtotal: number | null
          total: number | null
        }
        Insert: {
          cantidad?: number
          cantidad_recibida?: number
          compra_id: string
          created_at?: string
          factor_conversion?: number
          id?: string
          piezas_total?: number | null
          precio_unitario?: number
          producto_id?: string | null
          subtotal?: number | null
          total?: number | null
        }
        Update: {
          cantidad?: number
          cantidad_recibida?: number
          compra_id?: string
          created_at?: string
          factor_conversion?: number
          id?: string
          piezas_total?: number | null
          precio_unitario?: number
          producto_id?: string | null
          subtotal?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compra_lineas_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compra_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      compras: {
        Row: {
          almacen_id: string | null
          condicion_pago: string
          created_at: string
          created_by: string | null
          dias_credito: number | null
          empresa_id: string
          fecha: string
          folio: string | null
          id: string
          iva_total: number | null
          notas: string | null
          notas_pago: string | null
          proveedor_id: string | null
          saldo_pendiente: number | null
          status: string
          subtotal: number | null
          total: number | null
        }
        Insert: {
          almacen_id?: string | null
          condicion_pago?: string
          created_at?: string
          created_by?: string | null
          dias_credito?: number | null
          empresa_id: string
          fecha?: string
          folio?: string | null
          id?: string
          iva_total?: number | null
          notas?: string | null
          notas_pago?: string | null
          proveedor_id?: string | null
          saldo_pendiente?: number | null
          status?: string
          subtotal?: number | null
          total?: number | null
        }
        Update: {
          almacen_id?: string | null
          condicion_pago?: string
          created_at?: string
          created_by?: string | null
          dias_credito?: number | null
          empresa_id?: string
          fecha?: string
          folio?: string | null
          id?: string
          iva_total?: number | null
          notas?: string | null
          notas_pago?: string | null
          proveedor_id?: string | null
          saldo_pendiente?: number | null
          status?: string
          subtotal?: number | null
          total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "compras_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      conteo_entradas: {
        Row: {
          cantidad: number
          codigo_escaneado: string | null
          conteo_linea_id: string
          creado_por: string | null
          created_at: string
          id: string
        }
        Insert: {
          cantidad?: number
          codigo_escaneado?: string | null
          conteo_linea_id: string
          creado_por?: string | null
          created_at?: string
          id?: string
        }
        Update: {
          cantidad?: number
          codigo_escaneado?: string | null
          conteo_linea_id?: string
          creado_por?: string | null
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteo_entradas_conteo_linea_id_fkey"
            columns: ["conteo_linea_id"]
            isOneToOne: false
            referencedRelation: "conteo_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      conteo_lineas: {
        Row: {
          ajuste_aplicado: boolean
          cantidad_contada: number | null
          conteo_id: string
          costo_unitario: number
          created_at: string
          diferencia: number | null
          diferencia_valor: number | null
          id: string
          linea_abierta_en: string
          linea_cerrada_en: string | null
          notas: string | null
          producto_id: string | null
          status: string
          stock_esperado: number | null
          stock_inicial: number
        }
        Insert: {
          ajuste_aplicado?: boolean
          cantidad_contada?: number | null
          conteo_id: string
          costo_unitario?: number
          created_at?: string
          diferencia?: number | null
          diferencia_valor?: number | null
          id?: string
          linea_abierta_en?: string
          linea_cerrada_en?: string | null
          notas?: string | null
          producto_id?: string | null
          status?: string
          stock_esperado?: number | null
          stock_inicial?: number
        }
        Update: {
          ajuste_aplicado?: boolean
          cantidad_contada?: number | null
          conteo_id?: string
          costo_unitario?: number
          created_at?: string
          diferencia?: number | null
          diferencia_valor?: number | null
          id?: string
          linea_abierta_en?: string
          linea_cerrada_en?: string | null
          notas?: string | null
          producto_id?: string | null
          status?: string
          stock_esperado?: number | null
          stock_inicial?: number
        }
        Relationships: [
          {
            foreignKeyName: "conteo_lineas_conteo_id_fkey"
            columns: ["conteo_id"]
            isOneToOne: false
            referencedRelation: "conteos_fisicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteo_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      conteos_fisicos: {
        Row: {
          abierto_en: string
          almacen_id: string
          asignado_a: string | null
          cerrado_en: string | null
          clasificacion_id: string | null
          creado_por: string | null
          created_at: string
          diferencia_total_valor: number | null
          empresa_id: string
          filtro_stock: string
          folio: string
          id: string
          notas: string | null
          productos_contados: number
          status: string
          total_productos: number
          updated_at: string
        }
        Insert: {
          abierto_en?: string
          almacen_id: string
          asignado_a?: string | null
          cerrado_en?: string | null
          clasificacion_id?: string | null
          creado_por?: string | null
          created_at?: string
          diferencia_total_valor?: number | null
          empresa_id: string
          filtro_stock?: string
          folio: string
          id?: string
          notas?: string | null
          productos_contados?: number
          status?: string
          total_productos?: number
          updated_at?: string
        }
        Update: {
          abierto_en?: string
          almacen_id?: string
          asignado_a?: string | null
          cerrado_en?: string | null
          clasificacion_id?: string | null
          creado_por?: string | null
          created_at?: string
          diferencia_total_valor?: number | null
          empresa_id?: string
          filtro_stock?: string
          folio?: string
          id?: string
          notas?: string | null
          productos_contados?: number
          status?: string
          total_productos?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conteos_fisicos_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteos_fisicos_clasificacion_id_fkey"
            columns: ["clasificacion_id"]
            isOneToOne: false
            referencedRelation: "clasificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conteos_fisicos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      cotizacion_lineas: {
        Row: {
          cantidad: number
          cotizacion_id: string
          created_at: string
          descripcion: string | null
          descuento_pct: number
          empresa_id: string
          id: string
          ieps_monto: number
          ieps_pct: number
          impuesto: number
          impuesto_pct: number
          iva_monto: number
          iva_pct: number
          lista_precio_id: string | null
          notas: string | null
          orden: number
          precio_manual: boolean
          precio_unitario: number
          producto_id: string | null
          producto_snapshot: Json | null
          subtotal: number
          total: number
          unidad_id: string | null
        }
        Insert: {
          cantidad?: number
          cotizacion_id: string
          created_at?: string
          descripcion?: string | null
          descuento_pct?: number
          empresa_id: string
          id?: string
          ieps_monto?: number
          ieps_pct?: number
          impuesto?: number
          impuesto_pct?: number
          iva_monto?: number
          iva_pct?: number
          lista_precio_id?: string | null
          notas?: string | null
          orden?: number
          precio_manual?: boolean
          precio_unitario?: number
          producto_id?: string | null
          producto_snapshot?: Json | null
          subtotal?: number
          total?: number
          unidad_id?: string | null
        }
        Update: {
          cantidad?: number
          cotizacion_id?: string
          created_at?: string
          descripcion?: string | null
          descuento_pct?: number
          empresa_id?: string
          id?: string
          ieps_monto?: number
          ieps_pct?: number
          impuesto?: number
          impuesto_pct?: number
          iva_monto?: number
          iva_pct?: number
          lista_precio_id?: string | null
          notas?: string | null
          orden?: number
          precio_manual?: boolean
          precio_unitario?: number
          producto_id?: string | null
          producto_snapshot?: Json | null
          subtotal?: number
          total?: number
          unidad_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cotizacion_lineas_cotizacion_id_fkey"
            columns: ["cotizacion_id"]
            isOneToOne: false
            referencedRelation: "cotizaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizacion_lineas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      cotizaciones: {
        Row: {
          almacen_id: string | null
          cliente_id: string | null
          cliente_snapshot: Json | null
          created_at: string
          created_by: string | null
          descuento: number
          descuento_extra: number
          descuento_extra_motivo: string | null
          descuento_extra_tipo: string
          empresa_id: string
          enviada_wa_at: string | null
          estado: string
          fecha: string
          folio: string | null
          id: string
          ieps_total: number
          impuestos: number
          iva_total: number
          lista_precio_id: string | null
          moneda: string | null
          notas: string | null
          subtotal: number
          tarifa_id: string | null
          token_publico: string
          total: number
          updated_at: string
          vence_at: string | null
          vendedor_id: string | null
          venta_id: string | null
          vigencia_dias: number
        }
        Insert: {
          almacen_id?: string | null
          cliente_id?: string | null
          cliente_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          descuento?: number
          descuento_extra?: number
          descuento_extra_motivo?: string | null
          descuento_extra_tipo?: string
          empresa_id: string
          enviada_wa_at?: string | null
          estado?: string
          fecha?: string
          folio?: string | null
          id?: string
          ieps_total?: number
          impuestos?: number
          iva_total?: number
          lista_precio_id?: string | null
          moneda?: string | null
          notas?: string | null
          subtotal?: number
          tarifa_id?: string | null
          token_publico?: string
          total?: number
          updated_at?: string
          vence_at?: string | null
          vendedor_id?: string | null
          venta_id?: string | null
          vigencia_dias?: number
        }
        Update: {
          almacen_id?: string | null
          cliente_id?: string | null
          cliente_snapshot?: Json | null
          created_at?: string
          created_by?: string | null
          descuento?: number
          descuento_extra?: number
          descuento_extra_motivo?: string | null
          descuento_extra_tipo?: string
          empresa_id?: string
          enviada_wa_at?: string | null
          estado?: string
          fecha?: string
          folio?: string | null
          id?: string
          ieps_total?: number
          impuestos?: number
          iva_total?: number
          lista_precio_id?: string | null
          moneda?: string | null
          notas?: string | null
          subtotal?: number
          tarifa_id?: string | null
          token_publico?: string
          total?: number
          updated_at?: string
          vence_at?: string | null
          vendedor_id?: string | null
          venta_id?: string | null
          vigencia_dias?: number
        }
        Relationships: [
          {
            foreignKeyName: "cotizaciones_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cotizaciones_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "tarifas"
            referencedColumns: ["id"]
          },
        ]
      }
      cupon_usos: {
        Row: {
          aplicado_at: string | null
          cupon_id: string
          empresa_id: string
          id: string
          meses_restantes: number | null
          subscription_id: string | null
        }
        Insert: {
          aplicado_at?: string | null
          cupon_id: string
          empresa_id: string
          id?: string
          meses_restantes?: number | null
          subscription_id?: string | null
        }
        Update: {
          aplicado_at?: string | null
          cupon_id?: string
          empresa_id?: string
          id?: string
          meses_restantes?: number | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cupon_usos_cupon_id_fkey"
            columns: ["cupon_id"]
            isOneToOne: false
            referencedRelation: "cupones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupon_usos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupon_usos_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      cupones: {
        Row: {
          activo: boolean | null
          acumulable: boolean | null
          codigo: string
          created_at: string | null
          descripcion: string | null
          descuento_pct: number
          id: string
          meses_duracion: number | null
          partner_id: string | null
          planes_aplicables: string[] | null
          uso_maximo: number | null
          uso_por_empresa: number | null
          usos_actuales: number | null
          vigencia_fin: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          activo?: boolean | null
          acumulable?: boolean | null
          codigo: string
          created_at?: string | null
          descripcion?: string | null
          descuento_pct?: number
          id?: string
          meses_duracion?: number | null
          partner_id?: string | null
          planes_aplicables?: string[] | null
          uso_maximo?: number | null
          uso_por_empresa?: number | null
          usos_actuales?: number | null
          vigencia_fin?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          activo?: boolean | null
          acumulable?: boolean | null
          codigo?: string
          created_at?: string | null
          descripcion?: string | null
          descuento_pct?: number
          id?: string
          meses_duracion?: number | null
          partner_id?: string | null
          planes_aplicables?: string[] | null
          uso_maximo?: number | null
          uso_por_empresa?: number | null
          usos_actuales?: number | null
          vigencia_fin?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cupones_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_resumen"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "cupones_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_ai_recomendaciones: {
        Row: {
          content: string
          created_at: string
          empresa_id: string
          id: string
          model: string | null
          snapshot: Json | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          empresa_id: string
          id?: string
          model?: string | null
          snapshot?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          empresa_id?: string
          id?: string
          model?: string | null
          snapshot?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      descarga_ruta: {
        Row: {
          almacen_destino_id: string | null
          aprobado_por: string | null
          carga_id: string | null
          created_at: string
          descargo_camion: boolean
          diferencia_efectivo: number
          efectivo_entregado: number
          efectivo_esperado: number
          empresa_id: string
          fecha: string
          fecha_aprobacion: string | null
          fecha_fin: string | null
          fecha_inicio: string | null
          id: string
          notas: string | null
          notas_supervisor: string | null
          status: Database["public"]["Enums"]["status_descarga"]
          user_id: string
          vendedor_id: string | null
        }
        Insert: {
          almacen_destino_id?: string | null
          aprobado_por?: string | null
          carga_id?: string | null
          created_at?: string
          descargo_camion?: boolean
          diferencia_efectivo?: number
          efectivo_entregado?: number
          efectivo_esperado?: number
          empresa_id: string
          fecha?: string
          fecha_aprobacion?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          notas?: string | null
          notas_supervisor?: string | null
          status?: Database["public"]["Enums"]["status_descarga"]
          user_id: string
          vendedor_id?: string | null
        }
        Update: {
          almacen_destino_id?: string | null
          aprobado_por?: string | null
          carga_id?: string | null
          created_at?: string
          descargo_camion?: boolean
          diferencia_efectivo?: number
          efectivo_entregado?: number
          efectivo_esperado?: number
          empresa_id?: string
          fecha?: string
          fecha_aprobacion?: string | null
          fecha_fin?: string | null
          fecha_inicio?: string | null
          id?: string
          notas?: string | null
          notas_supervisor?: string | null
          status?: Database["public"]["Enums"]["status_descarga"]
          user_id?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "descarga_ruta_almacen_destino_id_fkey"
            columns: ["almacen_destino_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descarga_ruta_aprobado_por_profiles_fkey"
            columns: ["aprobado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descarga_ruta_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descarga_ruta_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descarga_ruta_vendedor_id_profiles_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      descarga_ruta_lineas: {
        Row: {
          cantidad_esperada: number
          cantidad_real: number
          created_at: string
          descarga_id: string
          diferencia: number
          id: string
          motivo: Database["public"]["Enums"]["motivo_diferencia"] | null
          notas: string | null
          producto_id: string | null
        }
        Insert: {
          cantidad_esperada?: number
          cantidad_real?: number
          created_at?: string
          descarga_id: string
          diferencia?: number
          id?: string
          motivo?: Database["public"]["Enums"]["motivo_diferencia"] | null
          notas?: string | null
          producto_id?: string | null
        }
        Update: {
          cantidad_esperada?: number
          cantidad_real?: number
          created_at?: string
          descarga_id?: string
          diferencia?: number
          id?: string
          motivo?: Database["public"]["Enums"]["motivo_diferencia"] | null
          notas?: string | null
          producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "descarga_ruta_lineas_descarga_id_fkey"
            columns: ["descarga_id"]
            isOneToOne: false
            referencedRelation: "descarga_ruta"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "descarga_ruta_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      devolucion_lineas: {
        Row: {
          accion: Database["public"]["Enums"]["accion_devolucion"]
          cantidad: number
          created_at: string
          devolucion_id: string
          id: string
          monto_credito: number
          motivo: Database["public"]["Enums"]["motivo_devolucion"]
          notas: string | null
          producto_id: string | null
          reemplazo_producto_id: string | null
        }
        Insert: {
          accion?: Database["public"]["Enums"]["accion_devolucion"]
          cantidad?: number
          created_at?: string
          devolucion_id: string
          id?: string
          monto_credito?: number
          motivo?: Database["public"]["Enums"]["motivo_devolucion"]
          notas?: string | null
          producto_id?: string | null
          reemplazo_producto_id?: string | null
        }
        Update: {
          accion?: Database["public"]["Enums"]["accion_devolucion"]
          cantidad?: number
          created_at?: string
          devolucion_id?: string
          id?: string
          monto_credito?: number
          motivo?: Database["public"]["Enums"]["motivo_devolucion"]
          notas?: string | null
          producto_id?: string | null
          reemplazo_producto_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devolucion_lineas_devolucion_id_fkey"
            columns: ["devolucion_id"]
            isOneToOne: false
            referencedRelation: "devoluciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devolucion_lineas_reemplazo_producto_id_fkey"
            columns: ["reemplazo_producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      devolucion_motivo_config: {
        Row: {
          a_mermas: boolean
          empresa_id: string
          id: string
          motivo: string
          updated_at: string | null
        }
        Insert: {
          a_mermas?: boolean
          empresa_id: string
          id?: string
          motivo: string
          updated_at?: string | null
        }
        Update: {
          a_mermas?: boolean
          empresa_id?: string
          id?: string
          motivo?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devolucion_motivo_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      devoluciones: {
        Row: {
          carga_id: string | null
          cliente_id: string | null
          created_at: string
          empresa_id: string
          fecha: string
          id: string
          notas: string | null
          tipo: Database["public"]["Enums"]["tipo_devolucion"]
          user_id: string
          vendedor_id: string | null
          venta_id: string | null
        }
        Insert: {
          carga_id?: string | null
          cliente_id?: string | null
          created_at?: string
          empresa_id: string
          fecha?: string
          id?: string
          notas?: string | null
          tipo?: Database["public"]["Enums"]["tipo_devolucion"]
          user_id: string
          vendedor_id?: string | null
          venta_id?: string | null
        }
        Update: {
          carga_id?: string | null
          cliente_id?: string | null
          created_at?: string
          empresa_id?: string
          fecha?: string
          id?: string
          notas?: string | null
          tipo?: Database["public"]["Enums"]["tipo_devolucion"]
          user_id?: string
          vendedor_id?: string | null
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "devoluciones_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_vendedor_id_profiles_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "devoluciones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      distancia_cache: {
        Row: {
          destino_hash: string
          distancia_m: number
          duracion_s: number
          empresa_id: string
          origen_hash: string
          updated_at: string
        }
        Insert: {
          destino_hash: string
          distancia_m: number
          duracion_s?: number
          empresa_id: string
          origen_hash: string
          updated_at?: string
        }
        Update: {
          destino_hash?: string
          distancia_m?: number
          duracion_s?: number
          empresa_id?: string
          origen_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      empresa_addons: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          updated_at: string
          wa_bot_activated_at: string | null
          wa_bot_activated_by: string | null
          wa_bot_enabled: boolean
          wa_bot_monthly_price: number | null
          wa_bot_notes: string | null
          wa_bot_requested_at: string | null
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          updated_at?: string
          wa_bot_activated_at?: string | null
          wa_bot_activated_by?: string | null
          wa_bot_enabled?: boolean
          wa_bot_monthly_price?: number | null
          wa_bot_notes?: string | null
          wa_bot_requested_at?: string | null
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          updated_at?: string
          wa_bot_activated_at?: string | null
          wa_bot_activated_by?: string | null
          wa_bot_enabled?: boolean
          wa_bot_monthly_price?: number | null
          wa_bot_notes?: string | null
          wa_bot_requested_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "empresa_addons_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          apartado_almacenes_ids: string[]
          apartado_solo_con_stock: boolean
          apartar_stock_pedidos: boolean
          ciudad: string | null
          clientes_visibilidad: string
          colonia: string | null
          cp: string | null
          created_at: string
          csf_url: string | null
          demo_expires_at: string | null
          direccion: string | null
          email: string
          email_cc_facturacion: string | null
          email_facturacion: string | null
          enviar_recibo_auto: boolean
          estado: string | null
          forma_pago_sat: string | null
          id: string
          is_partner_sandbox: boolean
          jornada_permite_sin_vehiculo: boolean
          lada: string
          logo_url: string | null
          maneja_lotes: boolean
          metodo_pago_sat: string | null
          moneda: string
          monthly_sales_goal: number
          nombre: string
          notas_ticket: string | null
          onboarding_completado: boolean | null
          owner_user_id: string | null
          partner_owner_id: string | null
          politica_cobro: string
          pos_turnos_habilitado: boolean
          razon_social: string | null
          regimen_fiscal: string | null
          requiere_jornada_desde: string | null
          requiere_jornada_ruta: boolean
          rfc: string | null
          telefono: string
          ticket_ancho: string
          ticket_campos: Json | null
          uso_cfdi: string | null
          zona_horaria: string
        }
        Insert: {
          apartado_almacenes_ids?: string[]
          apartado_solo_con_stock?: boolean
          apartar_stock_pedidos?: boolean
          ciudad?: string | null
          clientes_visibilidad?: string
          colonia?: string | null
          cp?: string | null
          created_at?: string
          csf_url?: string | null
          demo_expires_at?: string | null
          direccion?: string | null
          email: string
          email_cc_facturacion?: string | null
          email_facturacion?: string | null
          enviar_recibo_auto?: boolean
          estado?: string | null
          forma_pago_sat?: string | null
          id?: string
          is_partner_sandbox?: boolean
          jornada_permite_sin_vehiculo?: boolean
          lada?: string
          logo_url?: string | null
          maneja_lotes?: boolean
          metodo_pago_sat?: string | null
          moneda?: string
          monthly_sales_goal?: number
          nombre: string
          notas_ticket?: string | null
          onboarding_completado?: boolean | null
          owner_user_id?: string | null
          partner_owner_id?: string | null
          politica_cobro?: string
          pos_turnos_habilitado?: boolean
          razon_social?: string | null
          regimen_fiscal?: string | null
          requiere_jornada_desde?: string | null
          requiere_jornada_ruta?: boolean
          rfc?: string | null
          telefono: string
          ticket_ancho?: string
          ticket_campos?: Json | null
          uso_cfdi?: string | null
          zona_horaria?: string
        }
        Update: {
          apartado_almacenes_ids?: string[]
          apartado_solo_con_stock?: boolean
          apartar_stock_pedidos?: boolean
          ciudad?: string | null
          clientes_visibilidad?: string
          colonia?: string | null
          cp?: string | null
          created_at?: string
          csf_url?: string | null
          demo_expires_at?: string | null
          direccion?: string | null
          email?: string
          email_cc_facturacion?: string | null
          email_facturacion?: string | null
          enviar_recibo_auto?: boolean
          estado?: string | null
          forma_pago_sat?: string | null
          id?: string
          is_partner_sandbox?: boolean
          jornada_permite_sin_vehiculo?: boolean
          lada?: string
          logo_url?: string | null
          maneja_lotes?: boolean
          metodo_pago_sat?: string | null
          moneda?: string
          monthly_sales_goal?: number
          nombre?: string
          notas_ticket?: string | null
          onboarding_completado?: boolean | null
          owner_user_id?: string | null
          partner_owner_id?: string | null
          politica_cobro?: string
          pos_turnos_habilitado?: boolean
          razon_social?: string | null
          regimen_fiscal?: string | null
          requiere_jornada_desde?: string | null
          requiere_jornada_ruta?: boolean
          rfc?: string | null
          telefono?: string
          ticket_ancho?: string
          ticket_campos?: Json | null
          uso_cfdi?: string | null
          zona_horaria?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresas_partner_owner_id_fkey"
            columns: ["partner_owner_id"]
            isOneToOne: false
            referencedRelation: "partner_resumen"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "empresas_partner_owner_id_fkey"
            columns: ["partner_owner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      entrega_lineas: {
        Row: {
          almacen_origen_id: string | null
          cantidad_entregada: number
          cantidad_pedida: number
          created_at: string
          entrega_id: string
          hecho: boolean
          id: string
          lote_id: string | null
          motivo_no_entrega: string | null
          paquetes: number | null
          presentacion_factor: number | null
          presentacion_id: string | null
          presentacion_nombre: string | null
          producto_id: string | null
          unidad_id: string | null
        }
        Insert: {
          almacen_origen_id?: string | null
          cantidad_entregada?: number
          cantidad_pedida?: number
          created_at?: string
          entrega_id: string
          hecho?: boolean
          id?: string
          lote_id?: string | null
          motivo_no_entrega?: string | null
          paquetes?: number | null
          presentacion_factor?: number | null
          presentacion_id?: string | null
          presentacion_nombre?: string | null
          producto_id?: string | null
          unidad_id?: string | null
        }
        Update: {
          almacen_origen_id?: string | null
          cantidad_entregada?: number
          cantidad_pedida?: number
          created_at?: string
          entrega_id?: string
          hecho?: boolean
          id?: string
          lote_id?: string | null
          motivo_no_entrega?: string | null
          paquetes?: number | null
          presentacion_factor?: number | null
          presentacion_id?: string | null
          presentacion_nombre?: string | null
          producto_id?: string | null
          unidad_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entrega_lineas_almacen_origen_id_fkey"
            columns: ["almacen_origen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_lineas_entrega_id_fkey"
            columns: ["entrega_id"]
            isOneToOne: false
            referencedRelation: "entregas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entrega_lineas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      entregas: {
        Row: {
          almacen_id: string | null
          cliente_id: string | null
          created_at: string
          empresa_id: string
          fecha: string
          fecha_asignacion: string | null
          fecha_carga: string | null
          fecha_entrega: string | null
          folio: string | null
          id: string
          motivo_no_entrega: string | null
          notas: string | null
          orden_entrega: number | null
          pedido_id: string | null
          status: Database["public"]["Enums"]["status_entrega"]
          validado_at: string | null
          validado_por: string | null
          vendedor_id: string | null
          vendedor_ruta_id: string | null
        }
        Insert: {
          almacen_id?: string | null
          cliente_id?: string | null
          created_at?: string
          empresa_id: string
          fecha?: string
          fecha_asignacion?: string | null
          fecha_carga?: string | null
          fecha_entrega?: string | null
          folio?: string | null
          id?: string
          motivo_no_entrega?: string | null
          notas?: string | null
          orden_entrega?: number | null
          pedido_id?: string | null
          status?: Database["public"]["Enums"]["status_entrega"]
          validado_at?: string | null
          validado_por?: string | null
          vendedor_id?: string | null
          vendedor_ruta_id?: string | null
        }
        Update: {
          almacen_id?: string | null
          cliente_id?: string | null
          created_at?: string
          empresa_id?: string
          fecha?: string
          fecha_asignacion?: string | null
          fecha_carga?: string | null
          fecha_entrega?: string | null
          folio?: string | null
          id?: string
          motivo_no_entrega?: string | null
          notas?: string | null
          orden_entrega?: number | null
          pedido_id?: string | null
          status?: Database["public"]["Enums"]["status_entrega"]
          validado_at?: string | null
          validado_por?: string | null
          vendedor_id?: string | null
          vendedor_ruta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entregas_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_vendedor_id_profiles_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_vendedor_ruta_id_profiles_fkey"
            columns: ["vendedor_ruta_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas: {
        Row: {
          concepto: string | null
          creado_en: string | null
          descuento_porcentaje: number | null
          empresa_id: string
          es_prorrateo: boolean | null
          estado: string | null
          fecha_emision: string | null
          fecha_pago: string | null
          fecha_vencimiento: string | null
          id: string
          metodo_pago: string | null
          num_usuarios: number
          numero_factura: string | null
          periodo_fin: string
          periodo_inicio: string
          precio_unitario: number
          referencia_pago: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          suscripcion_id: string | null
          total: number
        }
        Insert: {
          concepto?: string | null
          creado_en?: string | null
          descuento_porcentaje?: number | null
          empresa_id: string
          es_prorrateo?: boolean | null
          estado?: string | null
          fecha_emision?: string | null
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          id?: string
          metodo_pago?: string | null
          num_usuarios?: number
          numero_factura?: string | null
          periodo_fin: string
          periodo_inicio: string
          precio_unitario?: number
          referencia_pago?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          suscripcion_id?: string | null
          total?: number
        }
        Update: {
          concepto?: string | null
          creado_en?: string | null
          descuento_porcentaje?: number | null
          empresa_id?: string
          es_prorrateo?: boolean | null
          estado?: string | null
          fecha_emision?: string | null
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          id?: string
          metodo_pago?: string | null
          num_usuarios?: number
          numero_factura?: string | null
          periodo_fin?: string
          periodo_inicio?: string
          precio_unitario?: number
          referencia_pago?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          suscripcion_id?: string | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "facturas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facturas_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          concepto: string
          created_at: string
          empresa_id: string
          fecha: string
          foto_url: string | null
          id: string
          monto: number
          notas: string | null
          user_id: string
          vendedor_id: string | null
        }
        Insert: {
          concepto: string
          created_at?: string
          empresa_id: string
          fecha?: string
          foto_url?: string | null
          id?: string
          monto?: number
          notas?: string | null
          user_id: string
          vendedor_id?: string | null
        }
        Update: {
          concepto?: string
          created_at?: string
          empresa_id?: string
          fecha?: string
          foto_url?: string | null
          id?: string
          monto?: number
          notas?: string | null
          user_id?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_vendedor_id_profiles_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_job_lineas: {
        Row: {
          cantidad: number | null
          codigo_externo: string | null
          created_at: string
          descripcion_externa: string | null
          empresa_id: string
          fila_num: number
          id: string
          job_id: string
          match_tipo: string
          mensaje: string | null
          precio: number | null
          producto_id: string | null
          raw: Json | null
        }
        Insert: {
          cantidad?: number | null
          codigo_externo?: string | null
          created_at?: string
          descripcion_externa?: string | null
          empresa_id: string
          fila_num: number
          id?: string
          job_id: string
          match_tipo: string
          mensaje?: string | null
          precio?: number | null
          producto_id?: string | null
          raw?: Json | null
        }
        Update: {
          cantidad?: number | null
          codigo_externo?: string | null
          created_at?: string
          descripcion_externa?: string | null
          empresa_id?: string
          fila_num?: number
          id?: string
          job_id?: string
          match_tipo?: string
          mensaje?: string | null
          precio?: number | null
          producto_id?: string | null
          raw?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "import_job_lineas_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_job_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          archivo_nombre: string | null
          created_at: string
          created_by: string | null
          duplicados: number
          empresa_id: string
          errores: number
          id: string
          matched: number
          resumen: Json | null
          sin_coincidencia: number
          sistema_origen: string | null
          status: string
          tipo: string
          total_filas: number
          updated_at: string
        }
        Insert: {
          archivo_nombre?: string | null
          created_at?: string
          created_by?: string | null
          duplicados?: number
          empresa_id: string
          errores?: number
          id?: string
          matched?: number
          resumen?: Json | null
          sin_coincidencia?: number
          sistema_origen?: string | null
          status?: string
          tipo?: string
          total_filas?: number
          updated_at?: string
        }
        Update: {
          archivo_nombre?: string | null
          created_at?: string
          created_by?: string | null
          duplicados?: number
          empresa_id?: string
          errores?: number
          id?: string
          matched?: number
          resumen?: Json | null
          sin_coincidencia?: number
          sistema_origen?: string | null
          status?: string
          tipo?: string
          total_filas?: number
          updated_at?: string
        }
        Relationships: []
      }
      internal_notification_reads: {
        Row: {
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "internal_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          empresa_id: string
          entity_id: string | null
          entity_type: string | null
          id: string
          link: string | null
          metadata: Json | null
          tipo: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          empresa_id: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          metadata?: Json | null
          tipo: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          empresa_id?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          link?: string | null
          metadata?: Json | null
          tipo?: string
          title?: string
        }
        Relationships: []
      }
      lista_precios: {
        Row: {
          activa: boolean
          created_at: string
          empresa_id: string
          es_principal: boolean
          id: string
          nombre: string
          share_activo: boolean
          share_token: string
          tarifa_id: string
        }
        Insert: {
          activa?: boolean
          created_at?: string
          empresa_id: string
          es_principal?: boolean
          id?: string
          nombre: string
          share_activo?: boolean
          share_token?: string
          tarifa_id: string
        }
        Update: {
          activa?: boolean
          created_at?: string
          empresa_id?: string
          es_principal?: boolean
          id?: string
          nombre?: string
          share_activo?: boolean
          share_token?: string
          tarifa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_precios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_precios_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "tarifas"
            referencedColumns: ["id"]
          },
        ]
      }
      lista_precios_lineas: {
        Row: {
          created_at: string
          id: string
          lista_precio_id: string
          precio: number
          producto_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lista_precio_id: string
          precio?: number
          producto_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lista_precio_id?: string
          precio?: number
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lista_precios_lineas_lista_precio_id_fkey"
            columns: ["lista_precio_id"]
            isOneToOne: false
            referencedRelation: "lista_precios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lista_precios_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      listas: {
        Row: {
          activo: boolean
          created_at: string
          empresa_id: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "listas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      lotes: {
        Row: {
          activo: boolean
          codigo: string
          costo: number | null
          created_at: string
          empresa_id: string
          fecha_caducidad: string | null
          fecha_fabricacion: string | null
          id: string
          notas: string | null
          producto_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          costo?: number | null
          created_at?: string
          empresa_id: string
          fecha_caducidad?: string | null
          fecha_fabricacion?: string | null
          id?: string
          notas?: string | null
          producto_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          costo?: number | null
          created_at?: string
          empresa_id?: string
          fecha_caducidad?: string | null
          fecha_fabricacion?: string | null
          id?: string
          notas?: string | null
          producto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lotes_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_log: {
        Row: {
          duracion_ms: number
          ejecutado_en: string
          ejecutado_por: string
          id: string
          notas: string | null
          tablas_procesadas: string[]
        }
        Insert: {
          duracion_ms?: number
          ejecutado_en?: string
          ejecutado_por: string
          id?: string
          notas?: string | null
          tablas_procesadas?: string[]
        }
        Update: {
          duracion_ms?: number
          ejecutado_en?: string
          ejecutado_por?: string
          id?: string
          notas?: string | null
          tablas_procesadas?: string[]
        }
        Relationships: []
      }
      marcas: {
        Row: {
          activo: boolean
          created_at: string
          empresa_id: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "marcas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      merma_lineas: {
        Row: {
          cantidad: number
          costo_unitario: number
          created_at: string
          empresa_id: string
          id: string
          merma_id: string
          precio_venta_unitario: number
          producto_id: string | null
          subtotal_costo: number
          subtotal_venta: number
        }
        Insert: {
          cantidad: number
          costo_unitario?: number
          created_at?: string
          empresa_id: string
          id?: string
          merma_id: string
          precio_venta_unitario?: number
          producto_id?: string | null
          subtotal_costo?: number
          subtotal_venta?: number
        }
        Update: {
          cantidad?: number
          costo_unitario?: number
          created_at?: string
          empresa_id?: string
          id?: string
          merma_id?: string
          precio_venta_unitario?: number
          producto_id?: string | null
          subtotal_costo?: number
          subtotal_venta?: number
        }
        Relationships: [
          {
            foreignKeyName: "merma_lineas_merma_id_fkey"
            columns: ["merma_id"]
            isOneToOne: false
            referencedRelation: "mermas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merma_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      merma_motivos: {
        Row: {
          activo: boolean
          created_at: string
          empresa_id: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      mermas: {
        Row: {
          almacen_origen_id: string
          cancelada: boolean
          cancelada_at: string | null
          cancelada_por: string | null
          creado_por: string | null
          created_at: string
          devolucion_id: string | null
          empresa_id: string
          fecha: string
          folio: string
          id: string
          motivo_id: string | null
          observaciones: string | null
          ruta_id: string | null
          total_costo: number
          total_venta: number
        }
        Insert: {
          almacen_origen_id: string
          cancelada?: boolean
          cancelada_at?: string | null
          cancelada_por?: string | null
          creado_por?: string | null
          created_at?: string
          devolucion_id?: string | null
          empresa_id: string
          fecha?: string
          folio: string
          id?: string
          motivo_id?: string | null
          observaciones?: string | null
          ruta_id?: string | null
          total_costo?: number
          total_venta?: number
        }
        Update: {
          almacen_origen_id?: string
          cancelada?: boolean
          cancelada_at?: string | null
          cancelada_por?: string | null
          creado_por?: string | null
          created_at?: string
          devolucion_id?: string | null
          empresa_id?: string
          fecha?: string
          folio?: string
          id?: string
          motivo_id?: string | null
          observaciones?: string | null
          ruta_id?: string | null
          total_costo?: number
          total_venta?: number
        }
        Relationships: [
          {
            foreignKeyName: "mermas_almacen_origen_id_fkey"
            columns: ["almacen_origen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mermas_motivo_id_fkey"
            columns: ["motivo_id"]
            isOneToOne: false
            referencedRelation: "merma_motivos"
            referencedColumns: ["id"]
          },
        ]
      }
      metas_venta: {
        Row: {
          clasificacion_id: string | null
          created_at: string
          created_by: string | null
          empresa_id: string
          id: string
          marca_id: string | null
          meta_monto: number
          meta_unidades: number
          notas: string | null
          periodo_month: number
          periodo_year: number
          presentacion_id: string | null
          producto_id: string | null
          updated_at: string
          vendedor_id: string | null
        }
        Insert: {
          clasificacion_id?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id: string
          id?: string
          marca_id?: string | null
          meta_monto?: number
          meta_unidades?: number
          notas?: string | null
          periodo_month: number
          periodo_year: number
          presentacion_id?: string | null
          producto_id?: string | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Update: {
          clasificacion_id?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          id?: string
          marca_id?: string | null
          meta_monto?: number
          meta_unidades?: number
          notas?: string | null
          periodo_month?: number
          periodo_year?: number
          presentacion_id?: string | null
          producto_id?: string | null
          updated_at?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metas_venta_clasificacion_id_fkey"
            columns: ["clasificacion_id"]
            isOneToOne: false
            referencedRelation: "clasificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_venta_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_venta_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_venta_presentacion_id_fkey"
            columns: ["presentacion_id"]
            isOneToOne: false
            referencedRelation: "producto_presentaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_venta_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metas_venta_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      movimientos_inventario: {
        Row: {
          almacen_destino_id: string | null
          almacen_origen_id: string | null
          cantidad: number
          created_at: string
          empresa_id: string
          fecha: string
          id: string
          lote_id: string | null
          notas: string | null
          producto_id: string | null
          referencia_id: string | null
          referencia_tipo: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          unidad_id: string | null
          user_id: string | null
          vendedor_destino_id: string | null
        }
        Insert: {
          almacen_destino_id?: string | null
          almacen_origen_id?: string | null
          cantidad?: number
          created_at?: string
          empresa_id: string
          fecha?: string
          id?: string
          lote_id?: string | null
          notas?: string | null
          producto_id?: string | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo: Database["public"]["Enums"]["tipo_movimiento"]
          unidad_id?: string | null
          user_id?: string | null
          vendedor_destino_id?: string | null
        }
        Update: {
          almacen_destino_id?: string | null
          almacen_origen_id?: string | null
          cantidad?: number
          created_at?: string
          empresa_id?: string
          fecha?: string
          id?: string
          lote_id?: string | null
          notas?: string | null
          producto_id?: string | null
          referencia_id?: string | null
          referencia_tipo?: string | null
          tipo?: Database["public"]["Enums"]["tipo_movimiento"]
          unidad_id?: string | null
          user_id?: string | null
          vendedor_destino_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movimientos_inventario_almacen_destino_id_fkey"
            columns: ["almacen_destino_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_almacen_origen_id_fkey"
            columns: ["almacen_origen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimientos_inventario_vendedor_destino_id_profiles_fkey"
            columns: ["vendedor_destino_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_views: {
        Row: {
          dismissed: boolean
          id: string
          last_seen_at: string
          notification_id: string
          user_id: string
          view_count: number
        }
        Insert: {
          dismissed?: boolean
          id?: string
          last_seen_at?: string
          notification_id: string
          user_id: string
          view_count?: number
        }
        Update: {
          dismissed?: boolean
          id?: string
          last_seen_at?: string
          notification_id?: string
          user_id?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_views_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          bg_color: string | null
          body: string
          created_at: string
          empresa_id: string | null
          end_date: string | null
          id: string
          image_url: string | null
          is_active: boolean
          max_views: number
          redirect_type:
            | Database["public"]["Enums"]["notification_redirect_type"]
            | null
          redirect_url: string | null
          start_date: string
          text_color: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
        }
        Insert: {
          bg_color?: string | null
          body?: string
          created_at?: string
          empresa_id?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_views?: number
          redirect_type?:
            | Database["public"]["Enums"]["notification_redirect_type"]
            | null
          redirect_url?: string | null
          start_date?: string
          text_color?: string | null
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Update: {
          bg_color?: string | null
          body?: string
          created_at?: string
          empresa_id?: string | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          max_views?: number
          redirect_type?:
            | Database["public"]["Enums"]["notification_redirect_type"]
            | null
          redirect_url?: string | null
          start_date?: string
          text_color?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
        }
        Relationships: [
          {
            foreignKeyName: "notifications_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      optimizacion_recargas: {
        Row: {
          cantidad_creditos: number
          created_at: string
          creditos_consumidos: number
          empresa_id: string
          id: string
          moneda: string
          monto_centavos: number
          paid_at: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          cantidad_creditos?: number
          created_at?: string
          creditos_consumidos?: number
          empresa_id: string
          id?: string
          moneda?: string
          monto_centavos?: number
          paid_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          cantidad_creditos?: number
          created_at?: string
          creditos_consumidos?: number
          empresa_id?: string
          id?: string
          moneda?: string
          monto_centavos?: number
          paid_at?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "optimizacion_recargas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      optimizacion_rutas_log: {
        Row: {
          clientes_count: number
          created_at: string
          dia_filtro: string | null
          empresa_id: string
          id: string
          user_id: string
        }
        Insert: {
          clientes_count?: number
          created_at?: string
          dia_filtro?: string | null
          empresa_id: string
          id?: string
          user_id: string
        }
        Update: {
          clientes_count?: number
          created_at?: string
          dia_filtro?: string | null
          empresa_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "optimizacion_rutas_log_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_codes: {
        Row: {
          attempts: number
          code: string
          created_at: string
          id: string
          phone: string
          verified: boolean
        }
        Insert: {
          attempts?: number
          code: string
          created_at?: string
          id?: string
          phone: string
          verified?: boolean
        }
        Update: {
          attempts?: number
          code?: string
          created_at?: string
          id?: string
          phone?: string
          verified?: boolean
        }
        Relationships: []
      }
      pago_comisiones: {
        Row: {
          created_at: string
          detalle_calculo: Json | null
          empresa_id: string
          estado: string
          fecha_corte: string
          fecha_pago: string | null
          gasto_id: string | null
          id: string
          notas: string | null
          periodo_desde: string | null
          periodo_hasta: string | null
          tipo_calculo: string
          total_comisiones: number
          user_id: string
          vendedor_id: string | null
        }
        Insert: {
          created_at?: string
          detalle_calculo?: Json | null
          empresa_id: string
          estado?: string
          fecha_corte: string
          fecha_pago?: string | null
          gasto_id?: string | null
          id?: string
          notas?: string | null
          periodo_desde?: string | null
          periodo_hasta?: string | null
          tipo_calculo?: string
          total_comisiones?: number
          user_id: string
          vendedor_id?: string | null
        }
        Update: {
          created_at?: string
          detalle_calculo?: Json | null
          empresa_id?: string
          estado?: string
          fecha_corte?: string
          fecha_pago?: string | null
          gasto_id?: string | null
          id?: string
          notas?: string | null
          periodo_desde?: string | null
          periodo_hasta?: string | null
          tipo_calculo?: string
          total_comisiones?: number
          user_id?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pago_comisiones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_comisiones_gasto_id_fkey"
            columns: ["gasto_id"]
            isOneToOne: false
            referencedRelation: "gastos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_comisiones_vendedor_id_profiles_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pago_compras: {
        Row: {
          compra_id: string
          created_at: string
          empresa_id: string
          fecha: string
          id: string
          metodo_pago: string
          monto: number
          notas: string | null
          proveedor_id: string | null
          referencia: string | null
          user_id: string
        }
        Insert: {
          compra_id: string
          created_at?: string
          empresa_id: string
          fecha?: string
          id?: string
          metodo_pago?: string
          monto?: number
          notas?: string | null
          proveedor_id?: string | null
          referencia?: string | null
          user_id: string
        }
        Update: {
          compra_id?: string
          created_at?: string
          empresa_id?: string
          fecha?: string
          id?: string
          metodo_pago?: string
          monto?: number
          notas?: string | null
          proveedor_id?: string | null
          referencia?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pago_compras_compra_id_fkey"
            columns: ["compra_id"]
            isOneToOne: false
            referencedRelation: "compras"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_compras_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pago_compras_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_atribuciones: {
        Row: {
          created_at: string
          cupon_id: string | null
          empresa_id: string
          id: string
          metodo: string
          partner_id: string
          ref_slug: string | null
        }
        Insert: {
          created_at?: string
          cupon_id?: string | null
          empresa_id: string
          id?: string
          metodo: string
          partner_id: string
          ref_slug?: string | null
        }
        Update: {
          created_at?: string
          cupon_id?: string | null
          empresa_id?: string
          id?: string
          metodo?: string
          partner_id?: string
          ref_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_atribuciones_cupon_id_fkey"
            columns: ["cupon_id"]
            isOneToOne: false
            referencedRelation: "cupones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_atribuciones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_atribuciones_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_resumen"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_atribuciones_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_comisiones: {
        Row: {
          created_at: string
          cupon_pct: number
          empresa_id: string
          factura_id: string | null
          id: string
          monto_comision: number
          monto_factura: number
          notas: string | null
          pagado_en: string | null
          pago_id: string | null
          partner_id: string
          partner_pct: number
          periodo: string
          status: string
        }
        Insert: {
          created_at?: string
          cupon_pct?: number
          empresa_id: string
          factura_id?: string | null
          id?: string
          monto_comision?: number
          monto_factura?: number
          notas?: string | null
          pagado_en?: string | null
          pago_id?: string | null
          partner_id: string
          partner_pct: number
          periodo: string
          status?: string
        }
        Update: {
          created_at?: string
          cupon_pct?: number
          empresa_id?: string
          factura_id?: string | null
          id?: string
          monto_comision?: number
          monto_factura?: number
          notas?: string | null
          pagado_en?: string | null
          pago_id?: string | null
          partner_id?: string
          partner_pct?: number
          periodo?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_comisiones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_comisiones_factura_id_fkey"
            columns: ["factura_id"]
            isOneToOne: true
            referencedRelation: "facturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_comisiones_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_resumen"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_comisiones_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_niveles: {
        Row: {
          beneficios: string[] | null
          bono_mxn: number | null
          color: string | null
          comision_pct: number
          created_at: string
          emoji: string | null
          empresas_max: number | null
          empresas_min: number
          id: string
          nombre: string
          orden: number
        }
        Insert: {
          beneficios?: string[] | null
          bono_mxn?: number | null
          color?: string | null
          comision_pct: number
          created_at?: string
          emoji?: string | null
          empresas_max?: number | null
          empresas_min: number
          id?: string
          nombre: string
          orden: number
        }
        Update: {
          beneficios?: string[] | null
          bono_mxn?: number | null
          color?: string | null
          comision_pct?: number
          created_at?: string
          emoji?: string | null
          empresas_max?: number | null
          empresas_min?: number
          id?: string
          nombre?: string
          orden?: number
        }
        Relationships: []
      }
      partner_pagos: {
        Row: {
          created_at: string
          id: string
          metodo: string | null
          monto: number
          notas: string | null
          pagado_en: string
          pagado_por: string | null
          partner_id: string
          referencia: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metodo?: string | null
          monto: number
          notas?: string | null
          pagado_en?: string
          pagado_por?: string | null
          partner_id: string
          referencia?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metodo?: string | null
          monto?: number
          notas?: string | null
          pagado_en?: string
          pagado_por?: string | null
          partner_id?: string
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_pagos_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_resumen"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_pagos_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_solicitudes: {
        Row: {
          created_at: string
          email: string
          experiencia: string | null
          id: string
          motivo: string | null
          nombre: string
          notas_admin: string | null
          partner_id: string | null
          processed_at: string | null
          processed_by: string | null
          redes: string | null
          status: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          experiencia?: string | null
          id?: string
          motivo?: string | null
          nombre: string
          notas_admin?: string | null
          partner_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          redes?: string | null
          status?: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          experiencia?: string | null
          id?: string
          motivo?: string | null
          nombre?: string
          notas_admin?: string | null
          partner_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          redes?: string | null
          status?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_solicitudes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_resumen"
            referencedColumns: ["partner_id"]
          },
          {
            foreignKeyName: "partner_solicitudes_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          comision_pct: number
          created_at: string
          email: string | null
          estado: string
          id: string
          nombre: string
          notas: string | null
          peor_nivel_fecha: string | null
          peor_nivel_pct_60d: number | null
          ref_slug: string
          sandbox_empresa_id: string | null
          telefono: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          comision_pct?: number
          created_at?: string
          email?: string | null
          estado?: string
          id?: string
          nombre: string
          notas?: string | null
          peor_nivel_fecha?: string | null
          peor_nivel_pct_60d?: number | null
          ref_slug: string
          sandbox_empresa_id?: string | null
          telefono?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          comision_pct?: number
          created_at?: string
          email?: string | null
          estado?: string
          id?: string
          nombre?: string
          notas?: string | null
          peor_nivel_fecha?: string | null
          peor_nivel_pct_60d?: number | null
          ref_slug?: string
          sandbox_empresa_id?: string | null
          telefono?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partners_sandbox_empresa_id_fkey"
            columns: ["sandbox_empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_links: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          empresa_id: string
          empresa_nombre: string
          id: string
          openpay_card_id: string | null
          openpay_customer_id: string | null
          openpay_plan_id: string
          openpay_subscription_id: string | null
          plan_amount: number
          plan_currency: string
          plan_name: string
          plan_repeat_unit: string
          status: string
          token: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          empresa_id: string
          empresa_nombre?: string
          id?: string
          openpay_card_id?: string | null
          openpay_customer_id?: string | null
          openpay_plan_id: string
          openpay_subscription_id?: string | null
          plan_amount?: number
          plan_currency?: string
          plan_name?: string
          plan_repeat_unit?: string
          status?: string
          token?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          empresa_id?: string
          empresa_nombre?: string
          id?: string
          openpay_card_id?: string | null
          openpay_customer_id?: string | null
          openpay_plan_id?: string
          openpay_subscription_id?: string | null
          plan_amount?: number
          plan_currency?: string
          plan_name?: string
          plan_repeat_unit?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      planes: {
        Row: {
          activo: boolean | null
          creado_en: string | null
          descripcion: string | null
          id: string
          nombre: string
          precio_base_mes: number
          precio_usuario_extra: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          usuarios_incluidos: number
        }
        Insert: {
          activo?: boolean | null
          creado_en?: string | null
          descripcion?: string | null
          id?: string
          nombre: string
          precio_base_mes: number
          precio_usuario_extra?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          usuarios_incluidos?: number
        }
        Update: {
          activo?: boolean | null
          creado_en?: string | null
          descripcion?: string | null
          id?: string
          nombre?: string
          precio_base_mes?: number
          precio_usuario_extra?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          usuarios_incluidos?: number
        }
        Relationships: []
      }
      producto_equivalencias: {
        Row: {
          codigo_externo: string
          created_at: string
          created_by: string | null
          empresa_id: string
          id: string
          notas: string | null
          producto_id: string
          sistema_origen: string | null
          updated_at: string
        }
        Insert: {
          codigo_externo: string
          created_at?: string
          created_by?: string | null
          empresa_id: string
          id?: string
          notas?: string | null
          producto_id: string
          sistema_origen?: string | null
          updated_at?: string
        }
        Update: {
          codigo_externo?: string
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          id?: string
          notas?: string | null
          producto_id?: string
          sistema_origen?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_equivalencias_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_presentaciones: {
        Row: {
          activo: boolean
          codigo_barras: string | null
          created_at: string
          empresa_id: string
          es_principal_stock: boolean
          factor_base: number
          id: string
          nombre: string
          orden: number
          precio_especial: number | null
          producto_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo_barras?: string | null
          created_at?: string
          empresa_id: string
          es_principal_stock?: boolean
          factor_base: number
          id?: string
          nombre: string
          orden?: number
          precio_especial?: number | null
          producto_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo_barras?: string | null
          created_at?: string
          empresa_id?: string
          es_principal_stock?: boolean
          factor_base?: number
          id?: string
          nombre?: string
          orden?: number
          precio_especial?: number | null
          producto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_presentaciones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      producto_proveedores: {
        Row: {
          created_at: string
          es_principal: boolean
          id: string
          notas: string | null
          precio_compra: number | null
          producto_id: string
          proveedor_id: string
          tiempo_entrega_dias: number | null
        }
        Insert: {
          created_at?: string
          es_principal?: boolean
          id?: string
          notas?: string | null
          precio_compra?: number | null
          producto_id: string
          proveedor_id: string
          tiempo_entrega_dias?: number | null
        }
        Update: {
          created_at?: string
          es_principal?: boolean
          id?: string
          notas?: string | null
          precio_compra?: number | null
          producto_id?: string
          proveedor_id?: string
          tiempo_entrega_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "producto_proveedores_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_proveedores_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      productos: {
        Row: {
          almacenes: string[] | null
          calculo_costo: Database["public"]["Enums"]["calculo_costo"] | null
          cantidad: number | null
          clasificacion_id: string | null
          clave_alterna: string | null
          codigo: string
          codigo_origen: string | null
          codigo_sat: string | null
          costo: number | null
          costo_incluye_impuestos: boolean
          created_at: string
          dias_cobertura: number
          empresa_id: string
          es_combo: boolean | null
          es_granel: boolean
          factor_conversion: number | null
          formula: string | null
          id: string
          ieps_pct: number
          ieps_tipo: string
          imagen_url: string | null
          iva_pct: number
          lead_time_dias: number
          lista_id: string | null
          maneja_lote: boolean
          marca_id: string | null
          max: number | null
          min: number | null
          modo_compra_sugerida: string
          monto_maximo: number | null
          nombre: string
          nombre_compra: string | null
          nombre_ticket: string | null
          nombre_venta: string | null
          notas: string | null
          pct_comision: number | null
          permitir_descuento: boolean | null
          precio_principal: number | null
          precio_sugerido_publico: number
          proveedor_preferido_id: string | null
          se_puede_comprar: boolean | null
          se_puede_inventariar: boolean | null
          se_puede_vender: boolean | null
          status: Database["public"]["Enums"]["status_producto"] | null
          tarifa_id: string | null
          tiene_comision: boolean | null
          tiene_ieps: boolean | null
          tiene_iva: boolean | null
          tipo_comision: Database["public"]["Enums"]["tipo_comision"] | null
          udem_sat_id: string | null
          unidad_compra_id: string | null
          unidad_granel: string
          unidad_venta_id: string | null
          usa_listas_precio: boolean
          usa_presentaciones: boolean
          vender_sin_stock: boolean | null
        }
        Insert: {
          almacenes?: string[] | null
          calculo_costo?: Database["public"]["Enums"]["calculo_costo"] | null
          cantidad?: number | null
          clasificacion_id?: string | null
          clave_alterna?: string | null
          codigo: string
          codigo_origen?: string | null
          codigo_sat?: string | null
          costo?: number | null
          costo_incluye_impuestos?: boolean
          created_at?: string
          dias_cobertura?: number
          empresa_id: string
          es_combo?: boolean | null
          es_granel?: boolean
          factor_conversion?: number | null
          formula?: string | null
          id?: string
          ieps_pct?: number
          ieps_tipo?: string
          imagen_url?: string | null
          iva_pct?: number
          lead_time_dias?: number
          lista_id?: string | null
          maneja_lote?: boolean
          marca_id?: string | null
          max?: number | null
          min?: number | null
          modo_compra_sugerida?: string
          monto_maximo?: number | null
          nombre: string
          nombre_compra?: string | null
          nombre_ticket?: string | null
          nombre_venta?: string | null
          notas?: string | null
          pct_comision?: number | null
          permitir_descuento?: boolean | null
          precio_principal?: number | null
          precio_sugerido_publico?: number
          proveedor_preferido_id?: string | null
          se_puede_comprar?: boolean | null
          se_puede_inventariar?: boolean | null
          se_puede_vender?: boolean | null
          status?: Database["public"]["Enums"]["status_producto"] | null
          tarifa_id?: string | null
          tiene_comision?: boolean | null
          tiene_ieps?: boolean | null
          tiene_iva?: boolean | null
          tipo_comision?: Database["public"]["Enums"]["tipo_comision"] | null
          udem_sat_id?: string | null
          unidad_compra_id?: string | null
          unidad_granel?: string
          unidad_venta_id?: string | null
          usa_listas_precio?: boolean
          usa_presentaciones?: boolean
          vender_sin_stock?: boolean | null
        }
        Update: {
          almacenes?: string[] | null
          calculo_costo?: Database["public"]["Enums"]["calculo_costo"] | null
          cantidad?: number | null
          clasificacion_id?: string | null
          clave_alterna?: string | null
          codigo?: string
          codigo_origen?: string | null
          codigo_sat?: string | null
          costo?: number | null
          costo_incluye_impuestos?: boolean
          created_at?: string
          dias_cobertura?: number
          empresa_id?: string
          es_combo?: boolean | null
          es_granel?: boolean
          factor_conversion?: number | null
          formula?: string | null
          id?: string
          ieps_pct?: number
          ieps_tipo?: string
          imagen_url?: string | null
          iva_pct?: number
          lead_time_dias?: number
          lista_id?: string | null
          maneja_lote?: boolean
          marca_id?: string | null
          max?: number | null
          min?: number | null
          modo_compra_sugerida?: string
          monto_maximo?: number | null
          nombre?: string
          nombre_compra?: string | null
          nombre_ticket?: string | null
          nombre_venta?: string | null
          notas?: string | null
          pct_comision?: number | null
          permitir_descuento?: boolean | null
          precio_principal?: number | null
          precio_sugerido_publico?: number
          proveedor_preferido_id?: string | null
          se_puede_comprar?: boolean | null
          se_puede_inventariar?: boolean | null
          se_puede_vender?: boolean | null
          status?: Database["public"]["Enums"]["status_producto"] | null
          tarifa_id?: string | null
          tiene_comision?: boolean | null
          tiene_ieps?: boolean | null
          tiene_iva?: boolean | null
          tipo_comision?: Database["public"]["Enums"]["tipo_comision"] | null
          udem_sat_id?: string | null
          unidad_compra_id?: string | null
          unidad_granel?: string
          unidad_venta_id?: string | null
          usa_listas_precio?: boolean
          usa_presentaciones?: boolean
          vender_sin_stock?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "productos_clasificacion_id_fkey"
            columns: ["clasificacion_id"]
            isOneToOne: false
            referencedRelation: "clasificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_lista_id_fkey"
            columns: ["lista_id"]
            isOneToOne: false
            referencedRelation: "listas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_marca_id_fkey"
            columns: ["marca_id"]
            isOneToOne: false
            referencedRelation: "marcas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_proveedor_preferido_id_fkey"
            columns: ["proveedor_preferido_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "tarifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_udem_sat_id_fkey"
            columns: ["udem_sat_id"]
            isOneToOne: false
            referencedRelation: "unidades_sat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_unidad_compra_id_fkey"
            columns: ["unidad_compra_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_unidad_venta_id_fkey"
            columns: ["unidad_venta_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          almacen_id: string | null
          archivado_en: string | null
          archivado_motivo: string | null
          archivado_por: string | null
          avatar_url: string | null
          comision_esquema_id: string | null
          created_at: string
          empresa_id: string
          estado: string
          id: string
          must_change_password: boolean
          nombre: string | null
          pin_code: string | null
          super_admin_override_empresa_id: string | null
          telefono: string | null
          user_id: string
        }
        Insert: {
          almacen_id?: string | null
          archivado_en?: string | null
          archivado_motivo?: string | null
          archivado_por?: string | null
          avatar_url?: string | null
          comision_esquema_id?: string | null
          created_at?: string
          empresa_id: string
          estado?: string
          id?: string
          must_change_password?: boolean
          nombre?: string | null
          pin_code?: string | null
          super_admin_override_empresa_id?: string | null
          telefono?: string | null
          user_id: string
        }
        Update: {
          almacen_id?: string | null
          archivado_en?: string | null
          archivado_motivo?: string | null
          archivado_por?: string | null
          avatar_url?: string | null
          comision_esquema_id?: string | null
          created_at?: string
          empresa_id?: string
          estado?: string
          id?: string
          must_change_password?: boolean
          nombre?: string | null
          pin_code?: string | null
          super_admin_override_empresa_id?: string | null
          telefono?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_comision_esquema_id_fkey"
            columns: ["comision_esquema_id"]
            isOneToOne: false
            referencedRelation: "comision_esquemas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      promocion_aplicada: {
        Row: {
          created_at: string
          descripcion: string | null
          descuento_aplicado: number
          id: string
          promocion_id: string
          venta_id: string
          venta_linea_id: string | null
        }
        Insert: {
          created_at?: string
          descripcion?: string | null
          descuento_aplicado?: number
          id?: string
          promocion_id: string
          venta_id: string
          venta_linea_id?: string | null
        }
        Update: {
          created_at?: string
          descripcion?: string | null
          descuento_aplicado?: number
          id?: string
          promocion_id?: string
          venta_id?: string
          venta_linea_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promocion_aplicada_promocion_id_fkey"
            columns: ["promocion_id"]
            isOneToOne: false
            referencedRelation: "promociones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promocion_aplicada_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promocion_aplicada_venta_linea_id_fkey"
            columns: ["venta_linea_id"]
            isOneToOne: false
            referencedRelation: "venta_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      promociones: {
        Row: {
          activa: boolean
          acumulable: boolean
          aplica_a: Database["public"]["Enums"]["aplica_promocion"]
          cantidad_gratis: number | null
          cantidad_minima: number | null
          clasificacion_ids: string[] | null
          cliente_ids: string[] | null
          created_at: string
          descripcion: string | null
          dias_semana: string[] | null
          empresa_id: string
          id: string
          nombre: string
          prioridad: number
          producto_gratis_id: string | null
          producto_ids: string[] | null
          tipo: Database["public"]["Enums"]["tipo_promocion"]
          valor: number
          vigencia_fin: string | null
          vigencia_inicio: string | null
          zona_ids: string[] | null
        }
        Insert: {
          activa?: boolean
          acumulable?: boolean
          aplica_a?: Database["public"]["Enums"]["aplica_promocion"]
          cantidad_gratis?: number | null
          cantidad_minima?: number | null
          clasificacion_ids?: string[] | null
          cliente_ids?: string[] | null
          created_at?: string
          descripcion?: string | null
          dias_semana?: string[] | null
          empresa_id: string
          id?: string
          nombre: string
          prioridad?: number
          producto_gratis_id?: string | null
          producto_ids?: string[] | null
          tipo?: Database["public"]["Enums"]["tipo_promocion"]
          valor?: number
          vigencia_fin?: string | null
          vigencia_inicio?: string | null
          zona_ids?: string[] | null
        }
        Update: {
          activa?: boolean
          acumulable?: boolean
          aplica_a?: Database["public"]["Enums"]["aplica_promocion"]
          cantidad_gratis?: number | null
          cantidad_minima?: number | null
          clasificacion_ids?: string[] | null
          cliente_ids?: string[] | null
          created_at?: string
          descripcion?: string | null
          dias_semana?: string[] | null
          empresa_id?: string
          id?: string
          nombre?: string
          prioridad?: number
          producto_gratis_id?: string | null
          producto_ids?: string[] | null
          tipo?: Database["public"]["Enums"]["tipo_promocion"]
          valor?: number
          vigencia_fin?: string | null
          vigencia_inicio?: string | null
          zona_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "promociones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promociones_producto_gratis_id_fkey"
            columns: ["producto_gratis_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          banco: string | null
          ciudad: string | null
          clabe: string | null
          colonia: string | null
          condicion_pago: string
          contacto: string | null
          cp: string | null
          created_at: string
          cuenta_banco: string | null
          dias_credito: number | null
          direccion: string | null
          email: string | null
          empresa_id: string
          estado: string | null
          id: string
          limite_credito: number | null
          nombre: string
          notas: string | null
          razon_social: string | null
          rfc: string | null
          sitio_web: string | null
          status: string
          telefono: string | null
          tiempo_entrega_dias: number | null
        }
        Insert: {
          banco?: string | null
          ciudad?: string | null
          clabe?: string | null
          colonia?: string | null
          condicion_pago?: string
          contacto?: string | null
          cp?: string | null
          created_at?: string
          cuenta_banco?: string | null
          dias_credito?: number | null
          direccion?: string | null
          email?: string | null
          empresa_id: string
          estado?: string | null
          id?: string
          limite_credito?: number | null
          nombre: string
          notas?: string | null
          razon_social?: string | null
          rfc?: string | null
          sitio_web?: string | null
          status?: string
          telefono?: string | null
          tiempo_entrega_dias?: number | null
        }
        Update: {
          banco?: string | null
          ciudad?: string | null
          clabe?: string | null
          colonia?: string | null
          condicion_pago?: string
          contacto?: string | null
          cp?: string | null
          created_at?: string
          cuenta_banco?: string | null
          dias_credito?: number | null
          direccion?: string | null
          email?: string | null
          empresa_id?: string
          estado?: string | null
          id?: string
          limite_credito?: number | null
          nombre?: string
          notas?: string | null
          razon_social?: string | null
          rfc?: string | null
          sitio_web?: string | null
          status?: string
          telefono?: string | null
          tiempo_entrega_dias?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      publicidad_anuncios: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          cta_label: string | null
          cta_url: string | null
          descripcion: string | null
          id: string
          media_url: string | null
          mostrar_popup: boolean
          tipo_media: string
          titulo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          descripcion?: string | null
          id?: string
          media_url?: string | null
          mostrar_popup?: boolean
          tipo_media?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          cta_label?: string | null
          cta_url?: string | null
          descripcion?: string | null
          id?: string
          media_url?: string | null
          mostrar_popup?: boolean
          tipo_media?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      publicidad_vistas: {
        Row: {
          anuncio_id: string
          id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          anuncio_id: string
          id?: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          anuncio_id?: string
          id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "publicidad_vistas_anuncio_id_fkey"
            columns: ["anuncio_id"]
            isOneToOne: false
            referencedRelation: "publicidad_anuncios"
            referencedColumns: ["id"]
          },
        ]
      }
      reportes_personalizados: {
        Row: {
          columnas: Json
          created_at: string
          created_by: string | null
          descripcion: string | null
          empresa_id: string
          filtros_default: Json
          fuente: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          columnas?: Json
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          empresa_id: string
          filtros_default?: Json
          fuente?: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          columnas?: Json
          created_at?: string
          created_by?: string | null
          descripcion?: string | null
          empresa_id?: string
          filtros_default?: Json
          fuente?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reportes_personalizados_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permisos: {
        Row: {
          accion: string
          id: string
          modulo: string
          permitido: boolean
          role_id: string
        }
        Insert: {
          accion: string
          id?: string
          modulo: string
          permitido?: boolean
          role_id: string
        }
        Update: {
          accion?: string
          id?: string
          modulo?: string
          permitido?: boolean
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permisos_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          acceso_ruta_movil: boolean
          activo: boolean
          created_at: string
          descripcion: string | null
          empresa_id: string
          es_sistema: boolean
          id: string
          nombre: string
          solo_movil: boolean
        }
        Insert: {
          acceso_ruta_movil?: boolean
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          empresa_id: string
          es_sistema?: boolean
          id?: string
          nombre: string
          solo_movil?: boolean
        }
        Update: {
          acceso_ruta_movil?: boolean
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          empresa_id?: string
          es_sistema?: boolean
          id?: string
          nombre?: string
          solo_movil?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "roles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      ruta_polyline_cache: {
        Row: {
          created_at: string
          distancia_total_m: number | null
          duracion_total_s: number | null
          empresa_id: string
          encoded_polyline: string
          id: string
          vendedor_id: string
          waypoints_hash: string
        }
        Insert: {
          created_at?: string
          distancia_total_m?: number | null
          duracion_total_s?: number | null
          empresa_id: string
          encoded_polyline: string
          id?: string
          vendedor_id: string
          waypoints_hash: string
        }
        Update: {
          created_at?: string
          distancia_total_m?: number | null
          duracion_total_s?: number | null
          empresa_id?: string
          encoded_polyline?: string
          id?: string
          vendedor_id?: string
          waypoints_hash?: string
        }
        Relationships: []
      }
      ruta_sesiones: {
        Row: {
          carga_id: string | null
          created_at: string
          empresa_id: string
          fecha: string
          fin_at: string | null
          foto_fin_url: string | null
          foto_inicio_url: string | null
          id: string
          inicio_at: string
          km_fin: number | null
          km_inicio: number
          km_recorridos: number | null
          lat_fin: number | null
          lat_inicio: number | null
          lng_fin: number | null
          lng_inicio: number | null
          notas_fin: string | null
          notas_inicio: string | null
          status: string
          updated_at: string
          vehiculo_id: string | null
          vendedor_id: string
        }
        Insert: {
          carga_id?: string | null
          created_at?: string
          empresa_id: string
          fecha?: string
          fin_at?: string | null
          foto_fin_url?: string | null
          foto_inicio_url?: string | null
          id?: string
          inicio_at?: string
          km_fin?: number | null
          km_inicio: number
          km_recorridos?: number | null
          lat_fin?: number | null
          lat_inicio?: number | null
          lng_fin?: number | null
          lng_inicio?: number | null
          notas_fin?: string | null
          notas_inicio?: string | null
          status?: string
          updated_at?: string
          vehiculo_id?: string | null
          vendedor_id: string
        }
        Update: {
          carga_id?: string | null
          created_at?: string
          empresa_id?: string
          fecha?: string
          fin_at?: string | null
          foto_fin_url?: string | null
          foto_inicio_url?: string | null
          id?: string
          inicio_at?: string
          km_fin?: number | null
          km_inicio?: number
          km_recorridos?: number | null
          lat_fin?: number | null
          lat_inicio?: number | null
          lng_fin?: number | null
          lng_inicio?: number | null
          notas_fin?: string | null
          notas_inicio?: string | null
          status?: string
          updated_at?: string
          vehiculo_id?: string | null
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ruta_sesiones_carga_id_fkey"
            columns: ["carga_id"]
            isOneToOne: false
            referencedRelation: "cargas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_sesiones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_sesiones_vehiculo_id_fkey"
            columns: ["vehiculo_id"]
            isOneToOne: false
            referencedRelation: "vehiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ruta_sesiones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitudes_pago: {
        Row: {
          aprobado_por: string | null
          cantidad_timbres: number | null
          cantidad_usuarios: number | null
          comprobante_url: string | null
          concepto: string
          created_at: string
          empresa_id: string
          fecha_aprobacion: string | null
          id: string
          metodo: string
          monto_centavos: number
          notas: string | null
          notas_admin: string | null
          plan_price_id: string | null
          status: string
          tipo: string
          user_id: string
        }
        Insert: {
          aprobado_por?: string | null
          cantidad_timbres?: number | null
          cantidad_usuarios?: number | null
          comprobante_url?: string | null
          concepto?: string
          created_at?: string
          empresa_id: string
          fecha_aprobacion?: string | null
          id?: string
          metodo?: string
          monto_centavos?: number
          notas?: string | null
          notas_admin?: string | null
          plan_price_id?: string | null
          status?: string
          tipo?: string
          user_id: string
        }
        Update: {
          aprobado_por?: string | null
          cantidad_timbres?: number | null
          cantidad_usuarios?: number | null
          comprobante_url?: string | null
          concepto?: string
          created_at?: string
          empresa_id?: string
          fecha_aprobacion?: string | null
          id?: string
          metodo?: string
          monto_centavos?: number
          notas?: string | null
          notas_admin?: string | null
          plan_price_id?: string | null
          status?: string
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "solicitudes_pago_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_almacen: {
        Row: {
          almacen_id: string
          cantidad: number
          empresa_id: string
          id: string
          producto_id: string
          updated_at: string
        }
        Insert: {
          almacen_id: string
          cantidad?: number
          empresa_id: string
          id?: string
          producto_id: string
          updated_at?: string
        }
        Update: {
          almacen_id?: string
          cantidad?: number
          empresa_id?: string
          id?: string
          producto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_almacen_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_almacen_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_almacen_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_apartado: {
        Row: {
          almacen_id: string
          cantidad: number
          created_at: string
          empresa_id: string
          id: string
          producto_id: string
          updated_at: string
          venta_id: string
          venta_linea_id: string
        }
        Insert: {
          almacen_id: string
          cantidad?: number
          created_at?: string
          empresa_id: string
          id?: string
          producto_id: string
          updated_at?: string
          venta_id: string
          venta_linea_id: string
        }
        Update: {
          almacen_id?: string
          cantidad?: number
          created_at?: string
          empresa_id?: string
          id?: string
          producto_id?: string
          updated_at?: string
          venta_id?: string
          venta_linea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_apartado_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_apartado_venta_linea_id_fkey"
            columns: ["venta_linea_id"]
            isOneToOne: true
            referencedRelation: "venta_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_camion: {
        Row: {
          cantidad_actual: number
          cantidad_inicial: number
          created_at: string
          empresa_id: string
          fecha: string
          id: string
          producto_id: string
          vendedor_id: string
        }
        Insert: {
          cantidad_actual?: number
          cantidad_inicial?: number
          created_at?: string
          empresa_id: string
          fecha?: string
          id?: string
          producto_id: string
          vendedor_id: string
        }
        Update: {
          cantidad_actual?: number
          cantidad_inicial?: number
          created_at?: string
          empresa_id?: string
          fecha?: string
          id?: string
          producto_id?: string
          vendedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_camion_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_camion_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_camion_vendedor_id_profiles_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_lotes: {
        Row: {
          almacen_id: string
          cantidad: number
          empresa_id: string
          id: string
          lote_id: string
          producto_id: string
          updated_at: string
        }
        Insert: {
          almacen_id: string
          cantidad?: number
          empresa_id: string
          id?: string
          lote_id: string
          producto_id: string
          updated_at?: string
        }
        Update: {
          almacen_id?: string
          cantidad?: number
          empresa_id?: string
          id?: string
          lote_id?: string
          producto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_lotes_lote_id_fkey"
            columns: ["lote_id"]
            isOneToOne: false
            referencedRelation: "lotes"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          activo: boolean
          capacitacion_sesiones: number
          created_at: string
          descripcion: string | null
          descuento_pct: number
          features_json: Json
          id: string
          ideal_para: string | null
          meses: number
          nombre: string
          orden: number
          periodo: string
          popular: boolean
          precio_base: number
          precio_extra_usuario: number
          precio_por_usuario: number
          slug: string | null
          stripe_price_id: string | null
          stripe_price_id_extra: string | null
          stripe_product_id: string | null
          usuarios_incluidos: number
        }
        Insert: {
          activo?: boolean
          capacitacion_sesiones?: number
          created_at?: string
          descripcion?: string | null
          descuento_pct?: number
          features_json?: Json
          id?: string
          ideal_para?: string | null
          meses?: number
          nombre: string
          orden?: number
          periodo?: string
          popular?: boolean
          precio_base?: number
          precio_extra_usuario?: number
          precio_por_usuario?: number
          slug?: string | null
          stripe_price_id?: string | null
          stripe_price_id_extra?: string | null
          stripe_product_id?: string | null
          usuarios_incluidos?: number
        }
        Update: {
          activo?: boolean
          capacitacion_sesiones?: number
          created_at?: string
          descripcion?: string | null
          descuento_pct?: number
          features_json?: Json
          id?: string
          ideal_para?: string | null
          meses?: number
          nombre?: string
          orden?: number
          periodo?: string
          popular?: boolean
          precio_base?: number
          precio_extra_usuario?: number
          precio_por_usuario?: number
          slug?: string | null
          stripe_price_id?: string | null
          stripe_price_id_extra?: string | null
          stripe_product_id?: string | null
          usuarios_incluidos?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          acceso_bloqueado: boolean
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          descuento_porcentaje: number | null
          empresa_id: string
          es_manual: boolean | null
          fecha_vencimiento: string | null
          id: string
          legacy_pricing: boolean
          max_usuarios: number
          plan_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          stripe_subscription_id: string | null
          terms_accepted_at: string | null
          trial_ends_at: string | null
          ultimo_checkout_session_id: string | null
          updated_at: string
        }
        Insert: {
          acceso_bloqueado?: boolean
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          descuento_porcentaje?: number | null
          empresa_id: string
          es_manual?: boolean | null
          fecha_vencimiento?: string | null
          id?: string
          legacy_pricing?: boolean
          max_usuarios?: number
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_subscription_id?: string | null
          terms_accepted_at?: string | null
          trial_ends_at?: string | null
          ultimo_checkout_session_id?: string | null
          updated_at?: string
        }
        Update: {
          acceso_bloqueado?: boolean
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          descuento_porcentaje?: number | null
          empresa_id?: string
          es_manual?: boolean | null
          fecha_vencimiento?: string | null
          id?: string
          legacy_pricing?: boolean
          max_usuarios?: number
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_subscription_id?: string | null
          terms_accepted_at?: string | null
          trial_ends_at?: string | null
          ultimo_checkout_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          email: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tarifa_lineas: {
        Row: {
          aplica_a: Database["public"]["Enums"]["aplica_a_tarifa"]
          base_precio: string
          clasificacion_ids: string[]
          comision_pct: number
          created_at: string
          descuento_max: number | null
          descuento_pct: number | null
          id: string
          lista_precio_id: string | null
          margen_pct: number | null
          notas: string | null
          precio: number
          precio_minimo: number | null
          producto_ids: string[]
          redondeo: string
          tarifa_id: string
          tipo_calculo: Database["public"]["Enums"]["tipo_calculo_tarifa"]
        }
        Insert: {
          aplica_a?: Database["public"]["Enums"]["aplica_a_tarifa"]
          base_precio?: string
          clasificacion_ids?: string[]
          comision_pct?: number
          created_at?: string
          descuento_max?: number | null
          descuento_pct?: number | null
          id?: string
          lista_precio_id?: string | null
          margen_pct?: number | null
          notas?: string | null
          precio?: number
          precio_minimo?: number | null
          producto_ids?: string[]
          redondeo?: string
          tarifa_id: string
          tipo_calculo?: Database["public"]["Enums"]["tipo_calculo_tarifa"]
        }
        Update: {
          aplica_a?: Database["public"]["Enums"]["aplica_a_tarifa"]
          base_precio?: string
          clasificacion_ids?: string[]
          comision_pct?: number
          created_at?: string
          descuento_max?: number | null
          descuento_pct?: number | null
          id?: string
          lista_precio_id?: string | null
          margen_pct?: number | null
          notas?: string | null
          precio?: number
          precio_minimo?: number | null
          producto_ids?: string[]
          redondeo?: string
          tarifa_id?: string
          tipo_calculo?: Database["public"]["Enums"]["tipo_calculo_tarifa"]
        }
        Relationships: [
          {
            foreignKeyName: "tarifa_lineas_lista_precio_id_fkey"
            columns: ["lista_precio_id"]
            isOneToOne: false
            referencedRelation: "lista_precios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarifa_lineas_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "tarifas"
            referencedColumns: ["id"]
          },
        ]
      }
      tarifas: {
        Row: {
          activa: boolean | null
          created_at: string
          descripcion: string | null
          empresa_id: string
          id: string
          moneda: string | null
          nombre: string
          tipo: Database["public"]["Enums"]["tipo_tarifa"] | null
          vigencia_fin: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          activa?: boolean | null
          created_at?: string
          descripcion?: string | null
          empresa_id: string
          id?: string
          moneda?: string | null
          nombre: string
          tipo?: Database["public"]["Enums"]["tipo_tarifa"] | null
          vigencia_fin?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          activa?: boolean | null
          created_at?: string
          descripcion?: string | null
          empresa_id?: string
          id?: string
          moneda?: string | null
          nombre?: string
          tipo?: Database["public"]["Enums"]["tipo_tarifa"] | null
          vigencia_fin?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tarifas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      tasas_ieps: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          porcentaje: number
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          porcentaje: number
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          porcentaje?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasas_ieps_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      tasas_isr_ret: {
        Row: {
          created_at: string | null
          empresa_id: string
          id: string
          nombre: string
          porcentaje: number
        }
        Insert: {
          created_at?: string | null
          empresa_id: string
          id?: string
          nombre: string
          porcentaje?: number
        }
        Update: {
          created_at?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          porcentaje?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasas_isr_ret_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      tasas_iva: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          porcentaje: number
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          porcentaje: number
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          porcentaje?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasas_iva_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      tasas_iva_ret: {
        Row: {
          created_at: string | null
          empresa_id: string
          id: string
          nombre: string
          porcentaje: number
        }
        Insert: {
          created_at?: string | null
          empresa_id: string
          id?: string
          nombre: string
          porcentaje?: number
        }
        Update: {
          created_at?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          porcentaje?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasas_iva_ret_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      tienda_clientes: {
        Row: {
          cliente_id: string
          created_at: string
          email: string
          empresa_id: string
          id: string
          password_hash: string
          telefono: string | null
          ultimo_login: string | null
          updated_at: string
          verificado: boolean
        }
        Insert: {
          cliente_id: string
          created_at?: string
          email: string
          empresa_id: string
          id?: string
          password_hash: string
          telefono?: string | null
          ultimo_login?: string | null
          updated_at?: string
          verificado?: boolean
        }
        Update: {
          cliente_id?: string
          created_at?: string
          email?: string
          empresa_id?: string
          id?: string
          password_hash?: string
          telefono?: string | null
          ultimo_login?: string | null
          updated_at?: string
          verificado?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tienda_clientes_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tienda_clientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      tienda_config: {
        Row: {
          activa: boolean
          almacen_id: string | null
          banner_url: string | null
          beneficios: Json
          color_primario: string | null
          color_secundario: string | null
          created_at: string
          empresa_id: string
          id: string
          lista_precios_default_id: string | null
          logo_url: string | null
          mensaje_bienvenida: string | null
          nombre_tienda: string
          permitir_invitados: boolean
          plantilla: string
          slug: string
          updated_at: string
          usar_lista_cliente: boolean
          whatsapp_pedidos: string | null
        }
        Insert: {
          activa?: boolean
          almacen_id?: string | null
          banner_url?: string | null
          beneficios?: Json
          color_primario?: string | null
          color_secundario?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          lista_precios_default_id?: string | null
          logo_url?: string | null
          mensaje_bienvenida?: string | null
          nombre_tienda: string
          permitir_invitados?: boolean
          plantilla?: string
          slug: string
          updated_at?: string
          usar_lista_cliente?: boolean
          whatsapp_pedidos?: string | null
        }
        Update: {
          activa?: boolean
          almacen_id?: string | null
          banner_url?: string | null
          beneficios?: Json
          color_primario?: string | null
          color_secundario?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          lista_precios_default_id?: string | null
          logo_url?: string | null
          mensaje_bienvenida?: string | null
          nombre_tienda?: string
          permitir_invitados?: boolean
          plantilla?: string
          slug?: string
          updated_at?: string
          usar_lista_cliente?: boolean
          whatsapp_pedidos?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tienda_config_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tienda_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tienda_config_lista_precios_default_id_fkey"
            columns: ["lista_precios_default_id"]
            isOneToOne: false
            referencedRelation: "lista_precios"
            referencedColumns: ["id"]
          },
        ]
      }
      timbres_movimientos: {
        Row: {
          cantidad: number
          created_at: string
          empresa_id: string
          id: string
          notas: string | null
          referencia_id: string | null
          saldo_anterior: number
          saldo_nuevo: number
          tipo: string
          user_id: string
        }
        Insert: {
          cantidad?: number
          created_at?: string
          empresa_id: string
          id?: string
          notas?: string | null
          referencia_id?: string | null
          saldo_anterior?: number
          saldo_nuevo?: number
          tipo?: string
          user_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          empresa_id?: string
          id?: string
          notas?: string | null
          referencia_id?: string | null
          saldo_anterior?: number
          saldo_nuevo?: number
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timbres_movimientos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      timbres_saldo: {
        Row: {
          empresa_id: string
          id: string
          saldo: number
          updated_at: string
        }
        Insert: {
          empresa_id: string
          id?: string
          saldo?: number
          updated_at?: string
        }
        Update: {
          empresa_id?: string
          id?: string
          saldo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timbres_saldo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      traspaso_lineas: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          producto_id: string | null
          traspaso_id: string
        }
        Insert: {
          cantidad?: number
          created_at?: string
          id?: string
          producto_id?: string | null
          traspaso_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          producto_id?: string | null
          traspaso_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "traspaso_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspaso_lineas_traspaso_id_fkey"
            columns: ["traspaso_id"]
            isOneToOne: false
            referencedRelation: "traspasos"
            referencedColumns: ["id"]
          },
        ]
      }
      traspasos: {
        Row: {
          almacen_destino_id: string | null
          almacen_origen_id: string | null
          created_at: string
          empresa_id: string
          fecha: string
          folio: string | null
          id: string
          notas: string | null
          status: Database["public"]["Enums"]["status_traspaso"]
          tipo: Database["public"]["Enums"]["tipo_traspaso"]
          user_id: string
          vendedor_destino_id: string | null
          vendedor_origen_id: string | null
        }
        Insert: {
          almacen_destino_id?: string | null
          almacen_origen_id?: string | null
          created_at?: string
          empresa_id: string
          fecha?: string
          folio?: string | null
          id?: string
          notas?: string | null
          status?: Database["public"]["Enums"]["status_traspaso"]
          tipo?: Database["public"]["Enums"]["tipo_traspaso"]
          user_id: string
          vendedor_destino_id?: string | null
          vendedor_origen_id?: string | null
        }
        Update: {
          almacen_destino_id?: string | null
          almacen_origen_id?: string | null
          created_at?: string
          empresa_id?: string
          fecha?: string
          folio?: string | null
          id?: string
          notas?: string | null
          status?: Database["public"]["Enums"]["status_traspaso"]
          tipo?: Database["public"]["Enums"]["tipo_traspaso"]
          user_id?: string
          vendedor_destino_id?: string | null
          vendedor_origen_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traspasos_almacen_destino_id_fkey"
            columns: ["almacen_destino_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_almacen_origen_id_fkey"
            columns: ["almacen_origen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_vendedor_destino_id_profiles_fkey"
            columns: ["vendedor_destino_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_vendedor_origen_id_profiles_fkey"
            columns: ["vendedor_origen_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_blacklist: {
        Row: {
          bloqueado_por: string | null
          created_at: string
          email: string | null
          empresa_nombre: string | null
          id: string
          motivo: string | null
          telefono: string | null
        }
        Insert: {
          bloqueado_por?: string | null
          created_at?: string
          email?: string | null
          empresa_nombre?: string | null
          id?: string
          motivo?: string | null
          telefono?: string | null
        }
        Update: {
          bloqueado_por?: string | null
          created_at?: string
          email?: string | null
          empresa_nombre?: string | null
          id?: string
          motivo?: string | null
          telefono?: string | null
        }
        Relationships: []
      }
      tutorial_videos: {
        Row: {
          created_at: string
          description: string | null
          empresa_id: string | null
          id: string
          module: string | null
          sort_order: number
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          empresa_id?: string | null
          id?: string
          module?: string | null
          sort_order?: number
          title: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          empresa_id?: string | null
          id?: string
          module?: string | null
          sort_order?: number
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutorial_videos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          abreviatura: string | null
          activo: boolean
          created_at: string
          empresa_id: string
          id: string
          nombre: string
        }
        Insert: {
          abreviatura?: string | null
          activo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
        }
        Update: {
          abreviatura?: string | null
          activo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "unidades_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades_sat: {
        Row: {
          clave: string
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          clave: string
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          clave?: string
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          label: string
          orden: number
          path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          label: string
          orden?: number
          path: string
          user_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          label?: string
          orden?: number
          path?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehiculos: {
        Row: {
          alias: string
          anio: number | null
          capacidad_kg: number | null
          created_at: string
          empresa_id: string
          foto_url: string | null
          id: string
          km_actual: number
          marca: string | null
          modelo: string | null
          notas: string | null
          placa: string | null
          status: string
          tipo: string
          updated_at: string
          vendedor_default_id: string | null
        }
        Insert: {
          alias: string
          anio?: number | null
          capacidad_kg?: number | null
          created_at?: string
          empresa_id: string
          foto_url?: string | null
          id?: string
          km_actual?: number
          marca?: string | null
          modelo?: string | null
          notas?: string | null
          placa?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          vendedor_default_id?: string | null
        }
        Update: {
          alias?: string
          anio?: number | null
          capacidad_kg?: number | null
          created_at?: string
          empresa_id?: string
          foto_url?: string | null
          id?: string
          km_actual?: number
          marca?: string | null
          modelo?: string | null
          notas?: string | null
          placa?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          vendedor_default_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehiculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehiculos_vendedor_default_id_fkey"
            columns: ["vendedor_default_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedor_ubicaciones: {
        Row: {
          accuracy: number | null
          battery_level: number | null
          empresa_id: string
          heading: number | null
          lat: number
          lng: number
          speed: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          battery_level?: number | null
          empresa_id: string
          heading?: number | null
          lat: number
          lng: number
          speed?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          battery_level?: number | null
          empresa_id?: string
          heading?: number | null
          lat?: number
          lng?: number
          speed?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendedor_ubicaciones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      vendedor_ubicaciones_historial: {
        Row: {
          accuracy: number | null
          battery_level: number | null
          empresa_id: string
          id: string
          lat: number
          lng: number
          recorded_at: string
          user_id: string
        }
        Insert: {
          accuracy?: number | null
          battery_level?: number | null
          empresa_id: string
          id?: string
          lat: number
          lng: number
          recorded_at?: string
          user_id: string
        }
        Update: {
          accuracy?: number | null
          battery_level?: number | null
          empresa_id?: string
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vendedores: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          nombre: string
          telefono: string | null
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          telefono?: string | null
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendedores_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_comisiones: {
        Row: {
          comision_monto: number
          comision_pct: number
          created_at: string
          empresa_id: string
          fecha_venta: string
          id: string
          monto_venta: number
          pagada: boolean
          pago_comision_id: string | null
          producto_id: string | null
          vendedor_id: string
          venta_id: string
          venta_linea_id: string
        }
        Insert: {
          comision_monto?: number
          comision_pct?: number
          created_at?: string
          empresa_id: string
          fecha_venta?: string
          id?: string
          monto_venta?: number
          pagada?: boolean
          pago_comision_id?: string | null
          producto_id?: string | null
          vendedor_id: string
          venta_id: string
          venta_linea_id: string
        }
        Update: {
          comision_monto?: number
          comision_pct?: number
          created_at?: string
          empresa_id?: string
          fecha_venta?: string
          id?: string
          monto_venta?: number
          pagada?: boolean
          pago_comision_id?: string | null
          producto_id?: string | null
          vendedor_id?: string
          venta_id?: string
          venta_linea_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_comisiones_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_comisiones_pago_fkey"
            columns: ["pago_comision_id"]
            isOneToOne: false
            referencedRelation: "pago_comisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_comisiones_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_comisiones_vendedor_id_profiles_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_comisiones_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_comisiones_venta_linea_id_fkey"
            columns: ["venta_linea_id"]
            isOneToOne: false
            referencedRelation: "venta_lineas"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_historial: {
        Row: {
          accion: string
          created_at: string
          detalles: Json | null
          empresa_id: string
          id: string
          user_id: string | null
          user_nombre: string
          venta_id: string
        }
        Insert: {
          accion: string
          created_at?: string
          detalles?: Json | null
          empresa_id: string
          id?: string
          user_id?: string | null
          user_nombre?: string
          venta_id: string
        }
        Update: {
          accion?: string
          created_at?: string
          detalles?: Json | null
          empresa_id?: string
          id?: string
          user_id?: string | null
          user_nombre?: string
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_historial_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_historial_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      venta_lineas: {
        Row: {
          almacen_id: string | null
          cantidad: number
          created_at: string
          descripcion: string | null
          descuento_pct: number | null
          empresa_id: string
          factura_cfdi_id: string | null
          facturado: boolean | null
          facturado_global: boolean
          id: string
          ieps_monto: number | null
          ieps_pct: number | null
          iva_monto: number | null
          iva_pct: number | null
          lista_precio_id: string | null
          lote_id: string | null
          notas: string | null
          paquetes: number | null
          precio_manual: boolean
          precio_unitario: number
          presentacion_factor: number | null
          presentacion_id: string | null
          presentacion_nombre: string | null
          producto_id: string | null
          subtotal: number | null
          total: number | null
          unidad_id: string | null
          venta_id: string
        }
        Insert: {
          almacen_id?: string | null
          cantidad?: number
          created_at?: string
          descripcion?: string | null
          descuento_pct?: number | null
          empresa_id: string
          factura_cfdi_id?: string | null
          facturado?: boolean | null
          facturado_global?: boolean
          id?: string
          ieps_monto?: number | null
          ieps_pct?: number | null
          iva_monto?: number | null
          iva_pct?: number | null
          lista_precio_id?: string | null
          lote_id?: string | null
          notas?: string | null
          paquetes?: number | null
          precio_manual?: boolean
          precio_unitario?: number
          presentacion_factor?: number | null
          presentacion_id?: string | null
          presentacion_nombre?: string | null
          producto_id?: string | null
          subtotal?: number | null
          total?: number | null
          unidad_id?: string | null
          venta_id: string
        }
        Update: {
          almacen_id?: string | null
          cantidad?: number
          created_at?: string
          descripcion?: string | null
          descuento_pct?: number | null
          empresa_id?: string
          factura_cfdi_id?: string | null
          facturado?: boolean | null
          facturado_global?: boolean
          id?: string
          ieps_monto?: number | null
          ieps_pct?: number | null
          iva_monto?: number | null
          iva_pct?: number | null
          lista_precio_id?: string | null
          lote_id?: string | null
          notas?: string | null
          paquetes?: number | null
          precio_manual?: boolean
          precio_unitario?: number
          presentacion_factor?: number | null
          presentacion_id?: string | null
          presentacion_nombre?: string | null
          producto_id?: string | null
          subtotal?: number | null
          total?: number | null
          unidad_id?: string | null
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_lineas_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_lineas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_lineas_factura_cfdi_id_fkey"
            columns: ["factura_cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_lineas_lista_precio_id_fkey"
            columns: ["lista_precio_id"]
            isOneToOne: false
            referencedRelation: "lista_precios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_lineas_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venta_lineas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      ventas: {
        Row: {
          almacen_id: string | null
          cerrado_at: string | null
          cerrado_por: string | null
          cerrado_snapshot: Json | null
          cliente_id: string | null
          comision_volumen_pago_id: string | null
          concepto: string | null
          condicion_pago: Database["public"]["Enums"]["condicion_pago"]
          created_at: string
          descuento_extra: number
          descuento_extra_motivo: string | null
          descuento_extra_tipo: string
          descuento_total: number | null
          empresa_id: string
          entrega_inmediata: boolean | null
          es_saldo_inicial: boolean
          fecha: string
          fecha_entrega: string | null
          fecha_vencimiento: string | null
          folio: string | null
          id: string
          ieps_total: number | null
          iva_total: number | null
          notas: string | null
          origen: string | null
          pedido_origen_id: string | null
          politica_cobro: string | null
          requiere_factura: boolean | null
          saldo_pendiente: number | null
          status: Database["public"]["Enums"]["status_venta"]
          subtotal: number | null
          tarifa_id: string | null
          tipo: Database["public"]["Enums"]["tipo_venta"]
          total: number | null
          total_efectivo: number | null
          turno_id: string | null
          vendedor_id: string | null
        }
        Insert: {
          almacen_id?: string | null
          cerrado_at?: string | null
          cerrado_por?: string | null
          cerrado_snapshot?: Json | null
          cliente_id?: string | null
          comision_volumen_pago_id?: string | null
          concepto?: string | null
          condicion_pago?: Database["public"]["Enums"]["condicion_pago"]
          created_at?: string
          descuento_extra?: number
          descuento_extra_motivo?: string | null
          descuento_extra_tipo?: string
          descuento_total?: number | null
          empresa_id: string
          entrega_inmediata?: boolean | null
          es_saldo_inicial?: boolean
          fecha?: string
          fecha_entrega?: string | null
          fecha_vencimiento?: string | null
          folio?: string | null
          id?: string
          ieps_total?: number | null
          iva_total?: number | null
          notas?: string | null
          origen?: string | null
          pedido_origen_id?: string | null
          politica_cobro?: string | null
          requiere_factura?: boolean | null
          saldo_pendiente?: number | null
          status?: Database["public"]["Enums"]["status_venta"]
          subtotal?: number | null
          tarifa_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_venta"]
          total?: number | null
          total_efectivo?: number | null
          turno_id?: string | null
          vendedor_id?: string | null
        }
        Update: {
          almacen_id?: string | null
          cerrado_at?: string | null
          cerrado_por?: string | null
          cerrado_snapshot?: Json | null
          cliente_id?: string | null
          comision_volumen_pago_id?: string | null
          concepto?: string | null
          condicion_pago?: Database["public"]["Enums"]["condicion_pago"]
          created_at?: string
          descuento_extra?: number
          descuento_extra_motivo?: string | null
          descuento_extra_tipo?: string
          descuento_total?: number | null
          empresa_id?: string
          entrega_inmediata?: boolean | null
          es_saldo_inicial?: boolean
          fecha?: string
          fecha_entrega?: string | null
          fecha_vencimiento?: string | null
          folio?: string | null
          id?: string
          ieps_total?: number | null
          iva_total?: number | null
          notas?: string | null
          origen?: string | null
          pedido_origen_id?: string | null
          politica_cobro?: string | null
          requiere_factura?: boolean | null
          saldo_pendiente?: number | null
          status?: Database["public"]["Enums"]["status_venta"]
          subtotal?: number | null
          tarifa_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_venta"]
          total?: number | null
          total_efectivo?: number | null
          turno_id?: string | null
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_comision_volumen_pago_id_fkey"
            columns: ["comision_volumen_pago_id"]
            isOneToOne: false
            referencedRelation: "pago_comisiones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_pedido_origen_id_fkey"
            columns: ["pedido_origen_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "tarifas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "caja_turnos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ventas_vendedor_id_profiles_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      visitas: {
        Row: {
          cliente_id: string | null
          created_at: string
          empresa_id: string
          fecha: string
          gps_lat: number | null
          gps_lng: number | null
          id: string
          motivo: string | null
          notas: string | null
          tipo: string
          user_id: string
          venta_id: string | null
        }
        Insert: {
          cliente_id?: string | null
          created_at?: string
          empresa_id: string
          fecha?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          motivo?: string | null
          notas?: string | null
          tipo?: string
          user_id: string
          venta_id?: string | null
        }
        Update: {
          cliente_id?: string | null
          created_at?: string
          empresa_id?: string
          fecha?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          motivo?: string | null
          notas?: string | null
          tipo?: string
          user_id?: string
          venta_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "visitas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitas_venta_id_fkey"
            columns: ["venta_id"]
            isOneToOne: false
            referencedRelation: "ventas"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_bot_authorized_numbers: {
        Row: {
          activo: boolean
          auto_intro_sent_at: string | null
          created_at: string
          created_by: string | null
          empresa_id: string
          id: string
          last_sent_alertas_semanal: string | null
          last_sent_cobranza_diaria: string | null
          last_sent_reporte_diario: string | null
          nombre: string | null
          permisos: Json
          phone_e164: string
          pref_alertas_semanal: boolean
          pref_cobranza_diaria: boolean
          pref_hora_reporte_diario: number
          pref_reporte_diario: boolean
          pref_reporte_diario_formato: string
          pref_reporte_diario_frecuencia: string
          profile_id: string | null
          updated_at: string
          welcome_sent_at: string | null
        }
        Insert: {
          activo?: boolean
          auto_intro_sent_at?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id: string
          id?: string
          last_sent_alertas_semanal?: string | null
          last_sent_cobranza_diaria?: string | null
          last_sent_reporte_diario?: string | null
          nombre?: string | null
          permisos?: Json
          phone_e164: string
          pref_alertas_semanal?: boolean
          pref_cobranza_diaria?: boolean
          pref_hora_reporte_diario?: number
          pref_reporte_diario?: boolean
          pref_reporte_diario_formato?: string
          pref_reporte_diario_frecuencia?: string
          profile_id?: string | null
          updated_at?: string
          welcome_sent_at?: string | null
        }
        Update: {
          activo?: boolean
          auto_intro_sent_at?: string | null
          created_at?: string
          created_by?: string | null
          empresa_id?: string
          id?: string
          last_sent_alertas_semanal?: string | null
          last_sent_cobranza_diaria?: string | null
          last_sent_reporte_diario?: string | null
          nombre?: string | null
          permisos?: Json
          phone_e164?: string
          pref_alertas_semanal?: boolean
          pref_cobranza_diaria?: boolean
          pref_hora_reporte_diario?: number
          pref_reporte_diario?: boolean
          pref_reporte_diario_formato?: string
          pref_reporte_diario_frecuencia?: string
          profile_id?: string | null
          updated_at?: string
          welcome_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_bot_authorized_numbers_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_bot_authorized_numbers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_bot_logs: {
        Row: {
          created_at: string
          empresa_id: string | null
          id: string
          inbound_text: string | null
          intent: string | null
          outcome: string
          params: Json | null
          pdf_url: string | null
          phone: string
          response_summary: string | null
        }
        Insert: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          inbound_text?: string | null
          intent?: string | null
          outcome?: string
          params?: Json | null
          pdf_url?: string | null
          phone: string
          response_summary?: string | null
        }
        Update: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          inbound_text?: string | null
          intent?: string | null
          outcome?: string
          params?: Json | null
          pdf_url?: string | null
          phone?: string
          response_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_bot_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_campaign_sends: {
        Row: {
          campaign_id: string
          created_at: string
          empresa_nombre: string | null
          error_detalle: string | null
          id: string
          nombre: string | null
          status: string
          telefono: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          empresa_nombre?: string | null
          error_detalle?: string | null
          id?: string
          nombre?: string | null
          status?: string
          telefono: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          empresa_nombre?: string | null
          error_detalle?: string | null
          id?: string
          nombre?: string | null
          status?: string
          telefono?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_campaign_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "wa_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_campaigns: {
        Row: {
          created_at: string
          filters: string[] | null
          id: string
          image_url: string | null
          message: string | null
          status: string
          total_failed: number
          total_recipients: number
          total_sent: number
        }
        Insert: {
          created_at?: string
          filters?: string[] | null
          id?: string
          image_url?: string | null
          message?: string | null
          status?: string
          total_failed?: number
          total_recipients?: number
          total_sent?: number
        }
        Update: {
          created_at?: string
          filters?: string[] | null
          id?: string
          image_url?: string | null
          message?: string | null
          status?: string
          total_failed?: number
          total_recipients?: number
          total_sent?: number
        }
        Relationships: []
      }
      wa_optouts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          motivo: string | null
          nombre: string | null
          telefono: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          motivo?: string | null
          nombre?: string | null
          telefono: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          motivo?: string | null
          nombre?: string | null
          telefono?: string
        }
        Relationships: []
      }
      whatsapp_config: {
        Row: {
          activo: boolean
          api_token: string
          api_url: string
          aviso_dia_antes: boolean
          aviso_vencido: boolean
          created_at: string | null
          empresa_id: string
          enviar_recibo_pago: boolean
          evolution_connected_at: string | null
          evolution_instance_name: string | null
          evolution_last_qr_at: string | null
          evolution_phone_number: string | null
          evolution_status: string | null
          id: string
          instance_name: string
          provider: string
        }
        Insert: {
          activo?: boolean
          api_token?: string
          api_url?: string
          aviso_dia_antes?: boolean
          aviso_vencido?: boolean
          created_at?: string | null
          empresa_id: string
          enviar_recibo_pago?: boolean
          evolution_connected_at?: string | null
          evolution_instance_name?: string | null
          evolution_last_qr_at?: string | null
          evolution_phone_number?: string | null
          evolution_status?: string | null
          id?: string
          instance_name?: string
          provider?: string
        }
        Update: {
          activo?: boolean
          api_token?: string
          api_url?: string
          aviso_dia_antes?: boolean
          aviso_vencido?: boolean
          created_at?: string | null
          empresa_id?: string
          enviar_recibo_pago?: boolean
          evolution_connected_at?: string | null
          evolution_instance_name?: string | null
          evolution_last_qr_at?: string | null
          evolution_phone_number?: string | null
          evolution_status?: string | null
          id?: string
          instance_name?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_config_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: true
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_log: {
        Row: {
          created_at: string | null
          empresa_id: string
          error_detalle: string | null
          id: string
          imagen_url: string | null
          mensaje: string | null
          referencia_id: string | null
          status: string
          telefono: string
          tipo: string
        }
        Insert: {
          created_at?: string | null
          empresa_id: string
          error_detalle?: string | null
          id?: string
          imagen_url?: string | null
          mensaje?: string | null
          referencia_id?: string | null
          status?: string
          telefono: string
          tipo: string
        }
        Update: {
          created_at?: string | null
          empresa_id?: string
          error_detalle?: string | null
          id?: string
          imagen_url?: string | null
          mensaje?: string | null
          referencia_id?: string | null
          status?: string
          telefono?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_log_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          activo: boolean
          created_at: string | null
          empresa_id: string
          id: string
          mensaje: string
          nombre: string
          tipo: string
        }
        Insert: {
          activo?: boolean
          created_at?: string | null
          empresa_id: string
          id?: string
          mensaje?: string
          nombre?: string
          tipo: string
        }
        Update: {
          activo?: boolean
          created_at?: string | null
          empresa_id?: string
          id?: string
          mensaje?: string
          nombre?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      zonas: {
        Row: {
          activo: boolean
          created_at: string
          empresa_id: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "zonas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      partner_resumen: {
        Row: {
          comision_pct: number | null
          empresas_referidas: number | null
          estado: string | null
          nombre: string | null
          partner_id: string | null
          ref_slug: string | null
          saldo_pendiente: number | null
          total_generado: number | null
          total_pagado: number | null
        }
        Insert: {
          comision_pct?: number | null
          empresas_referidas?: never
          estado?: string | null
          nombre?: string | null
          partner_id?: string | null
          ref_slug?: string | null
          saldo_pendiente?: never
          total_generado?: never
          total_pagado?: never
        }
        Update: {
          comision_pct?: number | null
          empresas_referidas?: never
          estado?: string | null
          nombre?: string | null
          partner_id?: string | null
          ref_slug?: string | null
          saldo_pendiente?: never
          total_generado?: never
          total_pagado?: never
        }
        Relationships: []
      }
    }
    Functions: {
      _aplica_stock_lote: {
        Args: {
          p_almacen: string
          p_delta: number
          p_empresa: string
          p_lote: string
          p_producto: string
        }
        Returns: undefined
      }
      _current_user_nombre: { Args: never; Returns: string }
      _inotif_cliente_nombre: { Args: { _id: string }; Returns: string }
      _map_entrega_status: { Args: { _s: string }; Returns: string }
      _mover_stock_entre_almacenes: {
        Args: {
          p_almacen_destino: string
          p_almacen_origen: string
          p_cantidad: number
          p_empresa_id: string
          p_fecha: string
          p_notas: string
          p_producto_id: string
          p_referencia_id: string
          p_referencia_tipo: string
          p_user_id: string
        }
        Returns: undefined
      }
      add_timbres: {
        Args: {
          p_cantidad: number
          p_empresa_id: string
          p_notas?: string
          p_user_id: string
        }
        Returns: number
      }
      aplicar_cobro: {
        Args: {
          p_aplicaciones: Json
          p_cliente_id: string
          p_empresa_id: string
          p_fecha: string
          p_metodo: string
          p_monto: number
          p_notas?: string
          p_referencia: string
          p_user_id?: string
        }
        Returns: string
      }
      aplicar_partner_referido: {
        Args: {
          p_cupon_codigo?: string
          p_empresa_id: string
          p_ref_slug?: string
        }
        Returns: Json
      }
      apply_carga_kardex: { Args: { _carga_id: string }; Returns: undefined }
      apply_conteo_ajustes: { Args: { p_conteo_id: string }; Returns: Json }
      aprobar_solicitud_partner: {
        Args: { _comision_pct?: number; _slug: string; _solicitud_id: string }
        Returns: string
      }
      archivar_usuario: {
        Args: { p_force?: boolean; p_motivo?: string; p_profile_id: string }
        Returns: Json
      }
      asignar_lote_masivo: {
        Args: {
          p_almacen_id: string
          p_caducidad: string
          p_codigo: string
          p_costo: number
          p_empresa_id: string
          p_fabricacion: string
          p_items: Json
          p_user_id: string
        }
        Returns: number
      }
      calc_audit_stock_teorico: {
        Args: { p_linea_id: string }
        Returns: number
      }
      calcular_comision_volumen: {
        Args: { p_desde: string; p_hasta: string; p_vendedor_id: string }
        Returns: Json
      }
      cancelar_entregas_bulk: {
        Args: { p_entrega_ids: string[]; p_motivo?: string; p_user_id?: string }
        Returns: Json
      }
      cancelar_merma: { Args: { _merma_id: string }; Returns: undefined }
      cancelar_traspaso: {
        Args: { p_traspaso_id: string; p_user_id: string }
        Returns: undefined
      }
      cerrar_pedido_parcial: {
        Args: { p_user_id?: string; p_venta_id: string }
        Returns: undefined
      }
      check_stock_lote_paridad: {
        Args: { p_empresa_id?: string }
        Returns: {
          almacen_id: string
          almacen_nombre: string
          caso: string
          codigo: string
          diferencia: number
          empresa_id: string
          nombre: string
          producto_id: string
          stock_general: number
          suma_lotes: number
        }[]
      }
      cleanup_old_vendedor_historial: { Args: never; Returns: undefined }
      cleanup_stale_vendedor_ubicaciones: { Args: never; Returns: undefined }
      close_audit_line: {
        Args: { p_cerrada: boolean; p_linea_id: string }
        Returns: undefined
      }
      close_full_audit: {
        Args: { p_auditoria_id: string; p_cerrada_por: string }
        Returns: undefined
      }
      confirm_timbre_reserve: {
        Args: { p_cfdi_id: string; p_reservation_id: string }
        Returns: boolean
      }
      confirmar_traspaso: {
        Args: { p_traspaso_id: string; p_user_id: string }
        Returns: undefined
      }
      count_active_users: { Args: { p_empresa_id: string }; Returns: number }
      deduct_timbre: {
        Args: { p_cfdi_id: string; p_empresa_id: string; p_user_id: string }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      delete_empresa_cascade: {
        Args: { p_deleted_by: string; p_empresa_id: string }
        Returns: undefined
      }
      delete_empresas_bulk: {
        Args: { p_deleted_by: string; p_empresa_ids: string[] }
        Returns: Json
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      ensure_almacen_mermas: { Args: { _empresa_id: string }; Returns: string }
      fn_disponible_almacen: {
        Args: { p_almacen_id: string; p_producto_id: string }
        Returns: number
      }
      fn_recalc_venta_saldo: {
        Args: { p_venta_id: string }
        Returns: undefined
      }
      generar_recibo_volumen: {
        Args: {
          p_desde: string
          p_fecha_corte?: string
          p_hasta: string
          p_vendedor_id: string
        }
        Returns: string
      }
      generate_folio: {
        Args: { p_empresa_id: string; p_tipo: string }
        Returns: string
      }
      get_audit_users: {
        Args: { p_auditoria_id: string }
        Returns: {
          nombre: string
          user_id: string
        }[]
      }
      get_database_health: { Args: never; Returns: Json }
      get_empresa_user_emails: {
        Args: { p_empresa_id: string }
        Returns: {
          email: string
          user_id: string
        }[]
      }
      get_entregas_bulk_preview: {
        Args: { p_entrega_ids: string[]; p_target_vendedor_id?: string }
        Returns: Json
      }
      get_inactive_empresas: {
        Args: { p_dias_inactivo?: number; p_dias_vencido?: number }
        Returns: {
          current_period_end: string
          dias_sin_actividad: number
          dias_vencido: number
          email: string
          empresa_created_at: string
          empresa_id: string
          fecha_vencimiento: string
          last_sign_in_at: string
          last_venta_at: string
          motivo: string
          nombre: string
          owner_email: string
          status: string
          telefono: string
          total_clientes: number
          total_usuarios: number
          total_ventas: number
          trial_ends_at: string
        }[]
      }
      get_my_empresa_id: { Args: never; Returns: string }
      get_my_partner_id: { Args: never; Returns: string }
      get_optimization_quota: {
        Args: { _empresa_id: string }
        Returns: {
          cuota_base: number
          cuota_total: number
          disponibles: number
          recargas_disponibles: number
          usadas_mes_actual: number
          usuarios_activos: number
        }[]
      }
      get_partner_active_empresas: {
        Args: { _partner_id: string }
        Returns: number
      }
      get_partner_nivel: {
        Args: { _partner_id: string }
        Returns: {
          color: string
          comision_pct: number
          emoji: string
          empresas_actuales: number
          empresas_max: number
          empresas_min: number
          empresas_para_siguiente: number
          nivel_id: string
          nombre: string
          orden: number
          siguiente_nombre: string
          siguiente_pct: number
        }[]
      }
      get_sandbox_usage: {
        Args: { p_empresa_id: string }
        Returns: {
          clientes_count: number
          clientes_max: number
          productos_count: number
          productos_max: number
          ventas_count: number
          ventas_max: number
        }[]
      }
      get_user_archive_summary: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      has_billing_access: { Args: { p_empresa_id: string }; Returns: boolean }
      is_diego_super_admin: { Args: { p_user_id: string }; Returns: boolean }
      is_email_blacklisted: { Args: { p_email: string }; Returns: boolean }
      is_empresa_admin: {
        Args: { p_empresa_id: string; p_user_id: string }
        Returns: boolean
      }
      is_sandbox_empresa: { Args: { p_empresa_id: string }; Returns: boolean }
      is_super_admin: { Args: { p_user_id: string }; Returns: boolean }
      log_venta_historial: {
        Args: {
          _accion: string
          _detalles?: Json
          _empresa_id: string
          _venta_id: string
        }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      next_folio: {
        Args: { p_empresa_id: string; prefix: string }
        Returns: string
      }
      pagar_comisiones_partner: {
        Args: {
          p_comision_ids?: string[]
          p_metodo?: string
          p_monto: number
          p_notas?: string
          p_partner_id: string
          p_referencia?: string
        }
        Returns: string
      }
      purge_internal_notifications: { Args: never; Returns: undefined }
      purge_old_gps_history: { Args: never; Returns: undefined }
      reabrir_pedido_parcial: {
        Args: { p_venta_id: string }
        Returns: undefined
      }
      reactivar_usuario: { Args: { p_profile_id: string }; Returns: Json }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reasignar_entregas_bulk: {
        Args: {
          p_entrega_ids: string[]
          p_target_vendedor_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      reasignar_pendientes_usuario: {
        Args: { p_profile_id: string; p_target_profile_id: string }
        Returns: Json
      }
      recalc_producto_costo: {
        Args: { p_producto_id: string }
        Returns: undefined
      }
      recalc_venta_totales: { Args: { p_venta_id: string }; Returns: undefined }
      rechazar_solicitud_partner: {
        Args: { _motivo?: string; _solicitud_id: string }
        Returns: undefined
      }
      recibir_compra_linea_parcial: {
        Args: {
          p_almacen_id: string
          p_compra_id: string
          p_empresa_id: string
          p_folio: string
          p_linea_id: string
          p_lote_id?: string
          p_piezas: number
          p_user_id: string
        }
        Returns: undefined
      }
      recibir_linea_compra: {
        Args: {
          p_almacen_id: string
          p_compra_id: string
          p_empresa_id: string
          p_folio: string
          p_piezas: number
          p_producto_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      reconciliar_saldos_cliente: {
        Args: { p_cliente_id: string }
        Returns: number
      }
      reconciliar_saldos_empresa: {
        Args: { p_empresa_id: string }
        Returns: number
      }
      registrar_cobro: {
        Args: { p_aplicaciones?: Json; p_cobro: Json }
        Returns: Json
      }
      registrar_merma: {
        Args: {
          _almacen_origen_id: string
          _devolucion_id?: string
          _lineas: Json
          _motivo_id: string
          _observaciones: string
          _ruta_id: string
        }
        Returns: string
      }
      registrar_saldo_inicial: {
        Args: {
          p_cliente_id: string
          p_concepto?: string
          p_empresa_id: string
          p_fecha?: string
          p_fecha_vencimiento?: string
          p_monto: number
          p_user_id?: string
        }
        Returns: string
      }
      release_timbre: {
        Args: { p_motivo?: string; p_reservation_id: string }
        Returns: boolean
      }
      repair_missing_entrega_carga: {
        Args: never
        Returns: {
          out_cantidad: number
          out_entrega_id: string
          out_folio: string
          out_producto_id: string
          out_ruta_almacen: string
        }[]
      }
      reprogramar_entregas_bulk: {
        Args: { p_entrega_ids: string[]; p_nueva_fecha: string }
        Returns: Json
      }
      reserve_timbre: {
        Args: { p_empresa_id: string; p_user_id: string }
        Returns: string
      }
      revertir_surtido_linea: {
        Args: { p_empresa_id: string; p_entrega_id: string; p_linea_id: string }
        Returns: undefined
      }
      run_maintenance_vacuum: { Args: { p_tables?: string[] }; Returns: Json }
      stock_almacen_at_eod: {
        Args: { p_almacen_id: string; p_fecha: string }
        Returns: {
          cantidad: number
          producto_id: string
        }[]
      }
      stock_almacen_at_eod_v2: {
        Args: { p_almacen_id: string; p_fecha: string }
        Returns: {
          cantidad: number
          producto_id: string
        }[]
      }
      super_admin_list_empresas: {
        Args: never
        Returns: {
          current_period_end: string
          id: string
          nombre: string
          status: string
          trial_ends_at: string
        }[]
      }
      surtir_linea_entrega: {
        Args: {
          p_almacen_origen_id: string
          p_cantidad_surtida: number
          p_empresa_id: string
          p_entrega_id: string
          p_linea_id: string
          p_producto_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      surtir_linea_entrega_lotes: {
        Args: {
          p_almacen_origen_id: string
          p_asignacion: Json
          p_empresa_id: string
          p_entrega_id: string
          p_linea_id: string
          p_producto_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      surtir_linea_entrega_parcial: {
        Args: {
          p_almacen_origen_id: string
          p_cantidad_pedida: number
          p_empresa_id: string
          p_entrega_id: string
          p_linea_id: string
          p_producto_id: string
          p_user_id: string
        }
        Returns: number
      }
      tiene_cobertura_vigente: {
        Args: { p_empresa_id: string }
        Returns: boolean
      }
      user_role_empresa_id: { Args: { p_user_id: string }; Returns: string }
      validar_stock_cotizacion: {
        Args: { p_almacen_id: string; p_cotizacion_id: string }
        Returns: {
          cantidad_solicitada: number
          descripcion: string
          faltante: number
          ok: boolean
          producto_id: string
          stock_disponible: number
        }[]
      }
      verify_admin_pin: {
        Args: { p_pin: string; p_user_id: string }
        Returns: boolean
      }
      wa_clientes_saldos: {
        Args: {
          p_empresa: string
          p_limit?: number
          p_query?: string
          p_solo_con_saldo?: boolean
        }
        Returns: {
          codigo: string
          credito: boolean
          dias_credito: number
          id: string
          limite_credito: number
          nombre: string
          saldo: number
          status: string
          telefono: string
        }[]
      }
    }
    Enums: {
      accion_devolucion:
        | "reposicion"
        | "nota_credito"
        | "devolucion_dinero"
        | "descuento_venta"
      aplica_a_tarifa: "todos" | "categoria" | "producto"
      aplica_promocion:
        | "todos"
        | "producto"
        | "clasificacion"
        | "cliente"
        | "zona"
      calculo_costo:
        | "promedio"
        | "ultimo"
        | "estandar"
        | "manual"
        | "ultimo_compra"
        | "ultimo_proveedor"
      condicion_pago: "contado" | "credito" | "por_definir"
      frecuencia_visita: "diaria" | "semanal" | "quincenal" | "mensual"
      motivo_devolucion:
        | "no_vendido"
        | "vencido"
        | "danado"
        | "cambio"
        | "otro"
        | "error_pedido"
        | "caducado"
      motivo_diferencia:
        | "error_entrega"
        | "merma"
        | "danado"
        | "faltante"
        | "sobrante"
        | "otro"
      notification_redirect_type: "internal" | "external" | "both"
      notification_type: "banner" | "modal" | "bubble"
      status_auditoria:
        | "pendiente"
        | "en_proceso"
        | "por_aprobar"
        | "aprobada"
        | "rechazada"
        | "cerrada"
      status_carga: "pendiente" | "en_ruta" | "completada" | "cancelada"
      status_cliente: "activo" | "inactivo" | "suspendido"
      status_descarga: "pendiente" | "aprobada" | "rechazada"
      status_entrega:
        | "borrador"
        | "surtido"
        | "asignado"
        | "cargado"
        | "en_ruta"
        | "listo"
        | "hecho"
        | "cancelado"
        | "no_entregado"
      status_producto: "activo" | "inactivo" | "borrador"
      status_traspaso: "borrador" | "confirmado" | "cancelado"
      status_venta:
        | "borrador"
        | "confirmado"
        | "entregado"
        | "facturado"
        | "cancelado"
      tipo_calculo_tarifa: "margen_costo" | "descuento_precio" | "precio_fijo"
      tipo_comision: "porcentaje" | "monto_fijo"
      tipo_devolucion: "almacen" | "tienda" | "—" | "–" | "-"
      tipo_movimiento: "entrada" | "salida" | "transferencia"
      tipo_promocion:
        | "descuento_porcentaje"
        | "descuento_monto"
        | "producto_gratis"
        | "precio_especial"
        | "volumen"
      tipo_tarifa: "general" | "por_cliente" | "por_ruta"
      tipo_traspaso: "almacen_almacen" | "almacen_ruta" | "ruta_almacen"
      tipo_venta: "pedido" | "venta_directa" | "saldo_inicial"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      accion_devolucion: [
        "reposicion",
        "nota_credito",
        "devolucion_dinero",
        "descuento_venta",
      ],
      aplica_a_tarifa: ["todos", "categoria", "producto"],
      aplica_promocion: [
        "todos",
        "producto",
        "clasificacion",
        "cliente",
        "zona",
      ],
      calculo_costo: [
        "promedio",
        "ultimo",
        "estandar",
        "manual",
        "ultimo_compra",
        "ultimo_proveedor",
      ],
      condicion_pago: ["contado", "credito", "por_definir"],
      frecuencia_visita: ["diaria", "semanal", "quincenal", "mensual"],
      motivo_devolucion: [
        "no_vendido",
        "vencido",
        "danado",
        "cambio",
        "otro",
        "error_pedido",
        "caducado",
      ],
      motivo_diferencia: [
        "error_entrega",
        "merma",
        "danado",
        "faltante",
        "sobrante",
        "otro",
      ],
      notification_redirect_type: ["internal", "external", "both"],
      notification_type: ["banner", "modal", "bubble"],
      status_auditoria: [
        "pendiente",
        "en_proceso",
        "por_aprobar",
        "aprobada",
        "rechazada",
        "cerrada",
      ],
      status_carga: ["pendiente", "en_ruta", "completada", "cancelada"],
      status_cliente: ["activo", "inactivo", "suspendido"],
      status_descarga: ["pendiente", "aprobada", "rechazada"],
      status_entrega: [
        "borrador",
        "surtido",
        "asignado",
        "cargado",
        "en_ruta",
        "listo",
        "hecho",
        "cancelado",
        "no_entregado",
      ],
      status_producto: ["activo", "inactivo", "borrador"],
      status_traspaso: ["borrador", "confirmado", "cancelado"],
      status_venta: [
        "borrador",
        "confirmado",
        "entregado",
        "facturado",
        "cancelado",
      ],
      tipo_calculo_tarifa: ["margen_costo", "descuento_precio", "precio_fijo"],
      tipo_comision: ["porcentaje", "monto_fijo"],
      tipo_devolucion: ["almacen", "tienda", "—", "–", "-"],
      tipo_movimiento: ["entrada", "salida", "transferencia"],
      tipo_promocion: [
        "descuento_porcentaje",
        "descuento_monto",
        "producto_gratis",
        "precio_especial",
        "volumen",
      ],
      tipo_tarifa: ["general", "por_cliente", "por_ruta"],
      tipo_traspaso: ["almacen_almacen", "almacen_ruta", "ruta_almacen"],
      tipo_venta: ["pedido", "venta_directa", "saldo_inicial"],
    },
  },
} as const
