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
          producto_id: string
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
          producto_id: string
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
          producto_id?: string
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
          empresa_id: string
          id: string
          nombre: string
          tipo: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
          tipo?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          empresa_id?: string
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
          producto_id: string
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
          producto_id: string
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
          producto_id?: string
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
          producto_id: string
        }
        Insert: {
          cantidad_cargada?: number
          cantidad_devuelta?: number
          cantidad_vendida?: number
          carga_id: string
          created_at?: string
          id?: string
          producto_id: string
        }
        Update: {
          cantidad_cargada?: number
          cantidad_devuelta?: number
          cantidad_vendida?: number
          carga_id?: string
          created_at?: string
          id?: string
          producto_id?: string
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
            foreignKeyName: "cargas_repartidor_id_fkey"
            columns: ["repartidor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cargas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
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
      cfdis: {
        Row: {
          cadena_original: string | null
          cancel_date: string | null
          cancel_status: string | null
          cfdi_type: string
          created_at: string
          currency: string
          empresa_id: string
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
            foreignKeyName: "clasificaciones_empresa_id_fkey"
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
          producto_id: string
        }
        Insert: {
          cantidad?: number
          cliente_id: string
          created_at?: string
          id?: string
          producto_id: string
        }
        Update: {
          cantidad?: number
          cliente_id?: string
          created_at?: string
          id?: string
          producto_id?: string
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
          limite_credito: number | null
          lista_id: string | null
          lista_precio_id: string | null
          nombre: string
          notas: string | null
          orden: number | null
          regimen_fiscal: string | null
          requiere_factura: boolean | null
          rfc: string | null
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
          limite_credito?: number | null
          lista_id?: string | null
          lista_precio_id?: string | null
          nombre: string
          notas?: string | null
          orden?: number | null
          regimen_fiscal?: string | null
          requiere_factura?: boolean | null
          rfc?: string | null
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
          limite_credito?: number | null
          lista_id?: string | null
          lista_precio_id?: string | null
          nombre?: string
          notas?: string | null
          orden?: number | null
          regimen_fiscal?: string | null
          requiere_factura?: boolean | null
          rfc?: string | null
          status?: Database["public"]["Enums"]["status_cliente"] | null
          tarifa_id?: string | null
          telefono?: string | null
          uso_cfdi?: string | null
          vendedor_id?: string | null
          zona_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_cobrador_id_fkey"
            columns: ["cobrador_id"]
            isOneToOne: false
            referencedRelation: "cobradores"
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
            foreignKeyName: "clientes_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
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
      compra_lineas: {
        Row: {
          cantidad: number
          compra_id: string
          created_at: string
          id: string
          precio_unitario: number
          producto_id: string
          subtotal: number | null
          total: number | null
        }
        Insert: {
          cantidad?: number
          compra_id: string
          created_at?: string
          id?: string
          precio_unitario?: number
          producto_id: string
          subtotal?: number | null
          total?: number | null
        }
        Update: {
          cantidad?: number
          compra_id?: string
          created_at?: string
          id?: string
          precio_unitario?: number
          producto_id?: string
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
          producto_id: string
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
          producto_id: string
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
          producto_id?: string
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
      descarga_ruta: {
        Row: {
          aprobado_por: string | null
          carga_id: string | null
          created_at: string
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
          aprobado_por?: string | null
          carga_id?: string | null
          created_at?: string
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
          aprobado_por?: string | null
          carga_id?: string | null
          created_at?: string
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
            foreignKeyName: "descarga_ruta_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
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
          producto_id: string
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
          producto_id: string
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
          producto_id?: string
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
          producto_id: string
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
          producto_id: string
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
          producto_id?: string
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
            foreignKeyName: "devoluciones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
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
      empresas: {
        Row: {
          ciudad: string | null
          clientes_visibilidad: string
          colonia: string | null
          cp: string | null
          created_at: string
          direccion: string | null
          email: string
          estado: string | null
          id: string
          logo_url: string | null
          moneda: string
          nombre: string
          notas_ticket: string | null
          owner_user_id: string | null
          razon_social: string | null
          regimen_fiscal: string | null
          rfc: string | null
          telefono: string
          ticket_ancho: string
          ticket_campos: Json | null
          zona_horaria: string
        }
        Insert: {
          ciudad?: string | null
          clientes_visibilidad?: string
          colonia?: string | null
          cp?: string | null
          created_at?: string
          direccion?: string | null
          email: string
          estado?: string | null
          id?: string
          logo_url?: string | null
          moneda?: string
          nombre: string
          notas_ticket?: string | null
          owner_user_id?: string | null
          razon_social?: string | null
          regimen_fiscal?: string | null
          rfc?: string | null
          telefono: string
          ticket_ancho?: string
          ticket_campos?: Json | null
          zona_horaria?: string
        }
        Update: {
          ciudad?: string | null
          clientes_visibilidad?: string
          colonia?: string | null
          cp?: string | null
          created_at?: string
          direccion?: string | null
          email?: string
          estado?: string | null
          id?: string
          logo_url?: string | null
          moneda?: string
          nombre?: string
          notas_ticket?: string | null
          owner_user_id?: string | null
          razon_social?: string | null
          regimen_fiscal?: string | null
          rfc?: string | null
          telefono?: string
          ticket_ancho?: string
          ticket_campos?: Json | null
          zona_horaria?: string
        }
        Relationships: []
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
          producto_id: string
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
          producto_id: string
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
          producto_id?: string
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
          folio: string | null
          id: string
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
          folio?: string | null
          id?: string
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
          folio?: string | null
          id?: string
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
            foreignKeyName: "entregas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_vendedor_ruta_id_fkey"
            columns: ["vendedor_ruta_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      facturas: {
        Row: {
          creado_en: string | null
          descuento_porcentaje: number | null
          empresa_id: string
          es_prorrateo: boolean | null
          estado: string | null
          fecha_emision: string | null
          fecha_pago: string | null
          fecha_vencimiento: string | null
          id: string
          num_usuarios: number
          numero_factura: string | null
          periodo_fin: string
          periodo_inicio: string
          precio_unitario: number
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          suscripcion_id: string | null
          total: number
        }
        Insert: {
          creado_en?: string | null
          descuento_porcentaje?: number | null
          empresa_id: string
          es_prorrateo?: boolean | null
          estado?: string | null
          fecha_emision?: string | null
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          id?: string
          num_usuarios?: number
          numero_factura?: string | null
          periodo_fin: string
          periodo_inicio: string
          precio_unitario?: number
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          suscripcion_id?: string | null
          total?: number
        }
        Update: {
          creado_en?: string | null
          descuento_porcentaje?: number | null
          empresa_id?: string
          es_prorrateo?: boolean | null
          estado?: string | null
          fecha_emision?: string | null
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          id?: string
          num_usuarios?: number
          numero_factura?: string | null
          periodo_fin?: string
          periodo_inicio?: string
          precio_unitario?: number
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
            foreignKeyName: "gastos_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
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
      movimientos_inventario: {
        Row: {
          almacen_destino_id: string | null
          almacen_origen_id: string | null
          cantidad: number
          created_at: string
          empresa_id: string
          fecha: string
          id: string
          notas: string | null
          producto_id: string
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
          notas?: string | null
          producto_id: string
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
          notas?: string | null
          producto_id?: string
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
            foreignKeyName: "movimientos_inventario_vendedor_destino_id_fkey"
            columns: ["vendedor_destino_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
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
          empresa_id: string
          fecha_corte: string
          id: string
          notas: string | null
          total_comisiones: number
          user_id: string
          vendedor_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          fecha_corte: string
          id?: string
          notas?: string | null
          total_comisiones?: number
          user_id: string
          vendedor_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          fecha_corte?: string
          id?: string
          notas?: string | null
          total_comisiones?: number
          user_id?: string
          vendedor_id?: string
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
            foreignKeyName: "pago_comisiones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
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
      producto_lotes: {
        Row: {
          almacen_id: string | null
          cantidad: number
          created_at: string
          empresa_id: string
          fecha_caducidad: string | null
          fecha_produccion: string | null
          id: string
          lote: string
          notas: string | null
          producto_id: string
        }
        Insert: {
          almacen_id?: string | null
          cantidad?: number
          created_at?: string
          empresa_id: string
          fecha_caducidad?: string | null
          fecha_produccion?: string | null
          id?: string
          lote: string
          notas?: string | null
          producto_id: string
        }
        Update: {
          almacen_id?: string | null
          cantidad?: number
          created_at?: string
          empresa_id?: string
          fecha_caducidad?: string | null
          fecha_produccion?: string | null
          id?: string
          lote?: string
          notas?: string | null
          producto_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_lotes_almacen_id_fkey"
            columns: ["almacen_id"]
            isOneToOne: false
            referencedRelation: "almacenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_lotes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_lotes_producto_id_fkey"
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
      producto_tarifas: {
        Row: {
          id: string
          producto_id: string
          tarifa_id: string
        }
        Insert: {
          id?: string
          producto_id: string
          tarifa_id: string
        }
        Update: {
          id?: string
          producto_id?: string
          tarifa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "producto_tarifas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "producto_tarifas_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "tarifas"
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
          codigo_sat: string | null
          contador: number | null
          contador_tarifas: number | null
          costo: number | null
          costo_incluye_impuestos: boolean
          created_at: string
          empresa_id: string
          es_combo: boolean | null
          factor_conversion: number | null
          id: string
          ieps_pct: number
          ieps_tipo: string
          imagen_url: string | null
          iva_pct: number
          lista_id: string | null
          manejar_lotes: boolean | null
          marca_id: string | null
          max: number | null
          min: number | null
          monto_maximo: number | null
          nombre: string
          notas: string | null
          pct_comision: number | null
          permitir_descuento: boolean | null
          precio_principal: number | null
          proveedor_id: string | null
          se_puede_comprar: boolean | null
          se_puede_inventariar: boolean | null
          se_puede_vender: boolean | null
          status: Database["public"]["Enums"]["status_producto"] | null
          tasa_ieps_id: string | null
          tasa_iva_id: string | null
          tiene_comision: boolean | null
          tiene_ieps: boolean | null
          tiene_iva: boolean | null
          tipo_comision: Database["public"]["Enums"]["tipo_comision"] | null
          udem_sat_id: string | null
          unidad_compra_id: string | null
          unidad_venta_id: string | null
          usa_listas_precio: boolean
          vender_sin_stock: boolean | null
        }
        Insert: {
          almacenes?: string[] | null
          calculo_costo?: Database["public"]["Enums"]["calculo_costo"] | null
          cantidad?: number | null
          clasificacion_id?: string | null
          clave_alterna?: string | null
          codigo: string
          codigo_sat?: string | null
          contador?: number | null
          contador_tarifas?: number | null
          costo?: number | null
          costo_incluye_impuestos?: boolean
          created_at?: string
          empresa_id: string
          es_combo?: boolean | null
          factor_conversion?: number | null
          id?: string
          ieps_pct?: number
          ieps_tipo?: string
          imagen_url?: string | null
          iva_pct?: number
          lista_id?: string | null
          manejar_lotes?: boolean | null
          marca_id?: string | null
          max?: number | null
          min?: number | null
          monto_maximo?: number | null
          nombre: string
          notas?: string | null
          pct_comision?: number | null
          permitir_descuento?: boolean | null
          precio_principal?: number | null
          proveedor_id?: string | null
          se_puede_comprar?: boolean | null
          se_puede_inventariar?: boolean | null
          se_puede_vender?: boolean | null
          status?: Database["public"]["Enums"]["status_producto"] | null
          tasa_ieps_id?: string | null
          tasa_iva_id?: string | null
          tiene_comision?: boolean | null
          tiene_ieps?: boolean | null
          tiene_iva?: boolean | null
          tipo_comision?: Database["public"]["Enums"]["tipo_comision"] | null
          udem_sat_id?: string | null
          unidad_compra_id?: string | null
          unidad_venta_id?: string | null
          usa_listas_precio?: boolean
          vender_sin_stock?: boolean | null
        }
        Update: {
          almacenes?: string[] | null
          calculo_costo?: Database["public"]["Enums"]["calculo_costo"] | null
          cantidad?: number | null
          clasificacion_id?: string | null
          clave_alterna?: string | null
          codigo?: string
          codigo_sat?: string | null
          contador?: number | null
          contador_tarifas?: number | null
          costo?: number | null
          costo_incluye_impuestos?: boolean
          created_at?: string
          empresa_id?: string
          es_combo?: boolean | null
          factor_conversion?: number | null
          id?: string
          ieps_pct?: number
          ieps_tipo?: string
          imagen_url?: string | null
          iva_pct?: number
          lista_id?: string | null
          manejar_lotes?: boolean | null
          marca_id?: string | null
          max?: number | null
          min?: number | null
          monto_maximo?: number | null
          nombre?: string
          notas?: string | null
          pct_comision?: number | null
          permitir_descuento?: boolean | null
          precio_principal?: number | null
          proveedor_id?: string | null
          se_puede_comprar?: boolean | null
          se_puede_inventariar?: boolean | null
          se_puede_vender?: boolean | null
          status?: Database["public"]["Enums"]["status_producto"] | null
          tasa_ieps_id?: string | null
          tasa_iva_id?: string | null
          tiene_comision?: boolean | null
          tiene_ieps?: boolean | null
          tiene_iva?: boolean | null
          tipo_comision?: Database["public"]["Enums"]["tipo_comision"] | null
          udem_sat_id?: string | null
          unidad_compra_id?: string | null
          unidad_venta_id?: string | null
          usa_listas_precio?: boolean
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
            foreignKeyName: "productos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_tasa_ieps_id_fkey"
            columns: ["tasa_ieps_id"]
            isOneToOne: false
            referencedRelation: "tasas_ieps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_tasa_iva_id_fkey"
            columns: ["tasa_iva_id"]
            isOneToOne: false
            referencedRelation: "tasas_iva"
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
          avatar_url: string | null
          created_at: string
          empresa_id: string
          estado: string
          id: string
          must_change_password: boolean
          nombre: string | null
          pin_code: string | null
          telefono: string | null
          user_id: string
          vendedor_id: string | null
        }
        Insert: {
          almacen_id?: string | null
          avatar_url?: string | null
          created_at?: string
          empresa_id: string
          estado?: string
          id?: string
          must_change_password?: boolean
          nombre?: string | null
          pin_code?: string | null
          telefono?: string | null
          user_id: string
          vendedor_id?: string | null
        }
        Update: {
          almacen_id?: string | null
          avatar_url?: string | null
          created_at?: string
          empresa_id?: string
          estado?: string
          id?: string
          must_change_password?: boolean
          nombre?: string | null
          pin_code?: string | null
          telefono?: string | null
          user_id?: string
          vendedor_id?: string | null
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
            foreignKeyName: "profiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
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
            foreignKeyName: "stock_camion_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          activo: boolean
          created_at: string
          descuento_pct: number
          id: string
          meses: number
          nombre: string
          periodo: string
          precio_por_usuario: number
          stripe_price_id: string | null
          stripe_product_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descuento_pct?: number
          id?: string
          meses?: number
          nombre: string
          periodo?: string
          precio_por_usuario?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          descuento_pct?: number
          id?: string
          meses?: number
          nombre?: string
          periodo?: string
          precio_por_usuario?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          descuento_porcentaje: number | null
          empresa_id: string
          es_manual: boolean | null
          id: string
          max_usuarios: number
          plan_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          descuento_porcentaje?: number | null
          empresa_id: string
          es_manual?: boolean | null
          id?: string
          max_usuarios?: number
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          descuento_porcentaje?: number | null
          empresa_id?: string
          es_manual?: boolean | null
          id?: string
          max_usuarios?: number
          plan_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
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
          producto_id: string
          traspaso_id: string
        }
        Insert: {
          cantidad?: number
          created_at?: string
          id?: string
          producto_id: string
          traspaso_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          producto_id?: string
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
            foreignKeyName: "traspasos_vendedor_destino_id_fkey"
            columns: ["vendedor_destino_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "traspasos_vendedor_origen_id_fkey"
            columns: ["vendedor_origen_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["id"]
          },
        ]
      }
      tutorial_videos: {
        Row: {
          created_at: string
          description: string | null
          empresa_id: string
          id: string
          module: string | null
          sort_order: number
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          empresa_id: string
          id?: string
          module?: string | null
          sort_order?: number
          title: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          empresa_id?: string
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
      vendedores: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string
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
            foreignKeyName: "venta_comisiones_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
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
          user_id: string
          user_nombre: string
          venta_id: string
        }
        Insert: {
          accion: string
          created_at?: string
          detalles?: Json | null
          empresa_id: string
          id?: string
          user_id: string
          user_nombre?: string
          venta_id: string
        }
        Update: {
          accion?: string
          created_at?: string
          detalles?: Json | null
          empresa_id?: string
          id?: string
          user_id?: string
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
          cantidad: number
          created_at: string
          descripcion: string | null
          descuento_pct: number | null
          factura_cfdi_id: string | null
          facturado: boolean | null
          id: string
          ieps_monto: number | null
          ieps_pct: number | null
          iva_monto: number | null
          iva_pct: number | null
          notas: string | null
          precio_unitario: number
          producto_id: string | null
          subtotal: number | null
          total: number | null
          unidad_id: string | null
          venta_id: string
        }
        Insert: {
          cantidad?: number
          created_at?: string
          descripcion?: string | null
          descuento_pct?: number | null
          factura_cfdi_id?: string | null
          facturado?: boolean | null
          id?: string
          ieps_monto?: number | null
          ieps_pct?: number | null
          iva_monto?: number | null
          iva_pct?: number | null
          notas?: string | null
          precio_unitario?: number
          producto_id?: string | null
          subtotal?: number | null
          total?: number | null
          unidad_id?: string | null
          venta_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          descripcion?: string | null
          descuento_pct?: number | null
          factura_cfdi_id?: string | null
          facturado?: boolean | null
          id?: string
          ieps_monto?: number | null
          ieps_pct?: number | null
          iva_monto?: number | null
          iva_pct?: number | null
          notas?: string | null
          precio_unitario?: number
          producto_id?: string | null
          subtotal?: number | null
          total?: number | null
          unidad_id?: string | null
          venta_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venta_lineas_factura_cfdi_id_fkey"
            columns: ["factura_cfdi_id"]
            isOneToOne: false
            referencedRelation: "cfdis"
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
          cliente_id: string | null
          condicion_pago: Database["public"]["Enums"]["condicion_pago"]
          created_at: string
          descuento_extra: number
          descuento_extra_tipo: string
          descuento_total: number | null
          empresa_id: string
          entrega_inmediata: boolean | null
          fecha: string
          fecha_entrega: string | null
          folio: string | null
          id: string
          ieps_total: number | null
          iva_total: number | null
          notas: string | null
          pedido_origen_id: string | null
          requiere_factura: boolean | null
          saldo_pendiente: number | null
          status: Database["public"]["Enums"]["status_venta"]
          subtotal: number | null
          tarifa_id: string | null
          tipo: Database["public"]["Enums"]["tipo_venta"]
          total: number | null
          vendedor_id: string | null
        }
        Insert: {
          almacen_id?: string | null
          cliente_id?: string | null
          condicion_pago?: Database["public"]["Enums"]["condicion_pago"]
          created_at?: string
          descuento_extra?: number
          descuento_extra_tipo?: string
          descuento_total?: number | null
          empresa_id: string
          entrega_inmediata?: boolean | null
          fecha?: string
          fecha_entrega?: string | null
          folio?: string | null
          id?: string
          ieps_total?: number | null
          iva_total?: number | null
          notas?: string | null
          pedido_origen_id?: string | null
          requiere_factura?: boolean | null
          saldo_pendiente?: number | null
          status?: Database["public"]["Enums"]["status_venta"]
          subtotal?: number | null
          tarifa_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_venta"]
          total?: number | null
          vendedor_id?: string | null
        }
        Update: {
          almacen_id?: string | null
          cliente_id?: string | null
          condicion_pago?: Database["public"]["Enums"]["condicion_pago"]
          created_at?: string
          descuento_extra?: number
          descuento_extra_tipo?: string
          descuento_total?: number | null
          empresa_id?: string
          entrega_inmediata?: boolean | null
          fecha?: string
          fecha_entrega?: string | null
          folio?: string | null
          id?: string
          ieps_total?: number | null
          iva_total?: number | null
          notas?: string | null
          pedido_origen_id?: string | null
          requiere_factura?: boolean | null
          saldo_pendiente?: number | null
          status?: Database["public"]["Enums"]["status_venta"]
          subtotal?: number | null
          tarifa_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_venta"]
          total?: number | null
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
            foreignKeyName: "ventas_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "vendedores"
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
          id: string
          instance_name: string
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
          id?: string
          instance_name?: string
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
          id?: string
          instance_name?: string
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
      [_ in never]: never
    }
    Functions: {
      add_timbres: {
        Args: {
          p_cantidad: number
          p_empresa_id: string
          p_notas?: string
          p_user_id: string
        }
        Returns: number
      }
      calc_audit_stock_teorico: {
        Args: { p_linea_id: string }
        Returns: number
      }
      cancelar_traspaso: {
        Args: { p_traspaso_id: string; p_user_id: string }
        Returns: undefined
      }
      close_audit_line: {
        Args: { p_cerrada: boolean; p_linea_id: string }
        Returns: undefined
      }
      close_full_audit: {
        Args: { p_auditoria_id: string; p_cerrada_por: string }
        Returns: undefined
      }
      confirmar_traspaso: {
        Args: { p_traspaso_id: string; p_user_id: string }
        Returns: undefined
      }
      deduct_timbre: {
        Args: { p_cfdi_id: string; p_empresa_id: string; p_user_id: string }
        Returns: boolean
      }
      get_audit_users: {
        Args: { p_auditoria_id: string }
        Returns: {
          nombre: string
          user_id: string
        }[]
      }
      get_my_empresa_id: { Args: never; Returns: string }
      is_super_admin: { Args: { p_user_id: string }; Returns: boolean }
      next_folio: {
        Args: { p_empresa_id: string; prefix: string }
        Returns: string
      }
      recalc_producto_costo: {
        Args: { p_producto_id: string }
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
      user_role_empresa_id: { Args: { p_user_id: string }; Returns: string }
      verify_admin_pin: {
        Args: { p_pin: string; p_user_id: string }
        Returns: boolean
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
      tipo_devolucion: "almacen" | "tienda"
      tipo_movimiento: "entrada" | "salida" | "transferencia"
      tipo_promocion:
        | "descuento_porcentaje"
        | "descuento_monto"
        | "producto_gratis"
        | "precio_especial"
        | "volumen"
      tipo_tarifa: "general" | "por_cliente" | "por_ruta"
      tipo_traspaso: "almacen_almacen" | "almacen_ruta" | "ruta_almacen"
      tipo_venta: "pedido" | "venta_directa"
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
      tipo_devolucion: ["almacen", "tienda"],
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
      tipo_venta: ["pedido", "venta_directa"],
    },
  },
} as const
