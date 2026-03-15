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
      almacenes: {
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
            foreignKeyName: "almacenes_empresa_id_fkey"
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
      cargas: {
        Row: {
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
      clasificaciones: {
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
          created_at: string
          credito: boolean | null
          dia_visita: string[] | null
          dias_credito: number | null
          direccion: string | null
          email: string | null
          empresa_id: string
          fecha_alta: string | null
          foto_fachada_url: string | null
          foto_url: string | null
          frecuencia: Database["public"]["Enums"]["frecuencia_visita"] | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          limite_credito: number | null
          lista_id: string | null
          nombre: string
          notas: string | null
          orden: number | null
          rfc: string | null
          status: Database["public"]["Enums"]["status_cliente"] | null
          tarifa_id: string | null
          telefono: string | null
          vendedor_id: string | null
          zona_id: string | null
        }
        Insert: {
          cobrador_id?: string | null
          codigo?: string | null
          colonia?: string | null
          contacto?: string | null
          created_at?: string
          credito?: boolean | null
          dia_visita?: string[] | null
          dias_credito?: number | null
          direccion?: string | null
          email?: string | null
          empresa_id: string
          fecha_alta?: string | null
          foto_fachada_url?: string | null
          foto_url?: string | null
          frecuencia?: Database["public"]["Enums"]["frecuencia_visita"] | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          limite_credito?: number | null
          lista_id?: string | null
          nombre: string
          notas?: string | null
          orden?: number | null
          rfc?: string | null
          status?: Database["public"]["Enums"]["status_cliente"] | null
          tarifa_id?: string | null
          telefono?: string | null
          vendedor_id?: string | null
          zona_id?: string | null
        }
        Update: {
          cobrador_id?: string | null
          codigo?: string | null
          colonia?: string | null
          contacto?: string | null
          created_at?: string
          credito?: boolean | null
          dia_visita?: string[] | null
          dias_credito?: number | null
          direccion?: string | null
          email?: string | null
          empresa_id?: string
          fecha_alta?: string | null
          foto_fachada_url?: string | null
          foto_url?: string | null
          frecuencia?: Database["public"]["Enums"]["frecuencia_visita"] | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          limite_credito?: number | null
          lista_id?: string | null
          nombre?: string
          notas?: string | null
          orden?: number | null
          rfc?: string | null
          status?: Database["public"]["Enums"]["status_cliente"] | null
          tarifa_id?: string | null
          telefono?: string | null
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
          cantidad: number
          created_at: string
          devolucion_id: string
          id: string
          motivo: Database["public"]["Enums"]["motivo_devolucion"]
          notas: string | null
          producto_id: string
        }
        Insert: {
          cantidad?: number
          created_at?: string
          devolucion_id: string
          id?: string
          motivo?: Database["public"]["Enums"]["motivo_devolucion"]
          notas?: string | null
          producto_id: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          devolucion_id?: string
          id?: string
          motivo?: Database["public"]["Enums"]["motivo_devolucion"]
          notas?: string | null
          producto_id?: string
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
        ]
      }
      empresas: {
        Row: {
          ciudad: string | null
          colonia: string | null
          cp: string | null
          created_at: string
          direccion: string | null
          email: string | null
          estado: string | null
          id: string
          logo_url: string | null
          nombre: string
          notas_ticket: string | null
          razon_social: string | null
          regimen_fiscal: string | null
          rfc: string | null
          telefono: string | null
          ticket_campos: Json | null
        }
        Insert: {
          ciudad?: string | null
          colonia?: string | null
          cp?: string | null
          created_at?: string
          direccion?: string | null
          email?: string | null
          estado?: string | null
          id?: string
          logo_url?: string | null
          nombre: string
          notas_ticket?: string | null
          razon_social?: string | null
          regimen_fiscal?: string | null
          rfc?: string | null
          telefono?: string | null
          ticket_campos?: Json | null
        }
        Update: {
          ciudad?: string | null
          colonia?: string | null
          cp?: string | null
          created_at?: string
          direccion?: string | null
          email?: string | null
          estado?: string | null
          id?: string
          logo_url?: string | null
          nombre?: string
          notas_ticket?: string | null
          razon_social?: string | null
          regimen_fiscal?: string | null
          rfc?: string | null
          telefono?: string | null
          ticket_campos?: Json | null
        }
        Relationships: []
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
      listas: {
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
            foreignKeyName: "marcas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
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
          id: string
          nombre: string | null
          user_id: string
          vendedor_id: string | null
        }
        Insert: {
          almacen_id?: string | null
          avatar_url?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nombre?: string | null
          user_id: string
          vendedor_id?: string | null
        }
        Update: {
          almacen_id?: string | null
          avatar_url?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string | null
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
      proveedores: {
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
          created_at: string
          descripcion: string | null
          empresa_id: string
          es_sistema: boolean
          id: string
          nombre: string
        }
        Insert: {
          acceso_ruta_movil?: boolean
          created_at?: string
          descripcion?: string | null
          empresa_id: string
          es_sistema?: boolean
          id?: string
          nombre: string
        }
        Update: {
          acceso_ruta_movil?: boolean
          created_at?: string
          descripcion?: string | null
          empresa_id?: string
          es_sistema?: boolean
          id?: string
          nombre?: string
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
      tarifa_lineas: {
        Row: {
          aplica_a: Database["public"]["Enums"]["aplica_a_tarifa"]
          clasificacion_ids: string[]
          created_at: string
          descuento_max: number | null
          descuento_pct: number | null
          id: string
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
          clasificacion_ids?: string[]
          created_at?: string
          descuento_max?: number | null
          descuento_pct?: number | null
          id?: string
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
          clasificacion_ids?: string[]
          created_at?: string
          descuento_max?: number | null
          descuento_pct?: number | null
          id?: string
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
      unidades: {
        Row: {
          abreviatura: string | null
          created_at: string
          empresa_id: string
          id: string
          nombre: string
        }
        Insert: {
          abreviatura?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nombre: string
        }
        Update: {
          abreviatura?: string | null
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
      venta_lineas: {
        Row: {
          cantidad: number
          created_at: string
          descripcion: string | null
          descuento_pct: number | null
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
      get_my_empresa_id: { Args: never; Returns: string }
      next_folio: {
        Args: { p_empresa_id: string; prefix: string }
        Returns: string
      }
      user_role_empresa_id: { Args: { p_user_id: string }; Returns: string }
    }
    Enums: {
      aplica_a_tarifa: "todos" | "categoria" | "producto"
      calculo_costo:
        | "promedio"
        | "ultimo"
        | "estandar"
        | "manual"
        | "ultimo_compra"
        | "ultimo_proveedor"
      condicion_pago: "contado" | "credito" | "por_definir"
      frecuencia_visita: "diaria" | "semanal" | "quincenal" | "mensual"
      motivo_devolucion: "no_vendido" | "vencido" | "danado" | "cambio" | "otro"
      motivo_diferencia:
        | "error_entrega"
        | "merma"
        | "danado"
        | "faltante"
        | "sobrante"
        | "otro"
      status_carga: "pendiente" | "en_ruta" | "completada" | "cancelada"
      status_cliente: "activo" | "inactivo" | "suspendido"
      status_descarga: "pendiente" | "aprobada" | "rechazada"
      status_producto: "activo" | "inactivo" | "borrador"
      status_venta:
        | "borrador"
        | "confirmado"
        | "entregado"
        | "facturado"
        | "cancelado"
      tipo_calculo_tarifa: "margen_costo" | "descuento_precio" | "precio_fijo"
      tipo_comision: "porcentaje" | "monto_fijo"
      tipo_devolucion: "almacen" | "tienda"
      tipo_tarifa: "general" | "por_cliente" | "por_ruta"
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
      aplica_a_tarifa: ["todos", "categoria", "producto"],
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
      motivo_devolucion: ["no_vendido", "vencido", "danado", "cambio", "otro"],
      motivo_diferencia: [
        "error_entrega",
        "merma",
        "danado",
        "faltante",
        "sobrante",
        "otro",
      ],
      status_carga: ["pendiente", "en_ruta", "completada", "cancelada"],
      status_cliente: ["activo", "inactivo", "suspendido"],
      status_descarga: ["pendiente", "aprobada", "rechazada"],
      status_producto: ["activo", "inactivo", "borrador"],
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
      tipo_tarifa: ["general", "por_cliente", "por_ruta"],
      tipo_venta: ["pedido", "venta_directa"],
    },
  },
} as const
