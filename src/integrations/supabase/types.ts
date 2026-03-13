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
      clientes: {
        Row: {
          contacto: string | null
          created_at: string
          direccion: string | null
          email: string | null
          empresa_id: string
          id: string
          nombre: string
          notas: string | null
          rfc: string | null
          status: string | null
          tarifa_id: string | null
          telefono: string | null
        }
        Insert: {
          contacto?: string | null
          created_at?: string
          direccion?: string | null
          email?: string | null
          empresa_id: string
          id?: string
          nombre: string
          notas?: string | null
          rfc?: string | null
          status?: string | null
          tarifa_id?: string | null
          telefono?: string | null
        }
        Update: {
          contacto?: string | null
          created_at?: string
          direccion?: string | null
          email?: string | null
          empresa_id?: string
          id?: string
          nombre?: string
          notas?: string | null
          rfc?: string | null
          status?: string | null
          tarifa_id?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clientes_tarifa_id_fkey"
            columns: ["tarifa_id"]
            isOneToOne: false
            referencedRelation: "tarifas"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
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
          created_at: string
          empresa_id: string
          es_combo: boolean | null
          factor_conversion: number | null
          id: string
          imagen_url: string | null
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
          created_at?: string
          empresa_id: string
          es_combo?: boolean | null
          factor_conversion?: number | null
          id?: string
          imagen_url?: string | null
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
          created_at?: string
          empresa_id?: string
          es_combo?: boolean | null
          factor_conversion?: number | null
          id?: string
          imagen_url?: string | null
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
          avatar_url: string | null
          created_at: string
          empresa_id: string
          id: string
          nombre: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nombre?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          empresa_id?: string
          id?: string
          nombre?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
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
      tarifa_lineas: {
        Row: {
          aplica_a: Database["public"]["Enums"]["aplica_a_tarifa"]
          clasificacion_id: string | null
          created_at: string
          descuento_max: number | null
          descuento_pct: number | null
          id: string
          margen_pct: number | null
          notas: string | null
          precio: number
          precio_minimo: number | null
          producto_id: string | null
          tarifa_id: string
          tipo_calculo: Database["public"]["Enums"]["tipo_calculo_tarifa"]
        }
        Insert: {
          aplica_a?: Database["public"]["Enums"]["aplica_a_tarifa"]
          clasificacion_id?: string | null
          created_at?: string
          descuento_max?: number | null
          descuento_pct?: number | null
          id?: string
          margen_pct?: number | null
          notas?: string | null
          precio?: number
          precio_minimo?: number | null
          producto_id?: string | null
          tarifa_id: string
          tipo_calculo?: Database["public"]["Enums"]["tipo_calculo_tarifa"]
        }
        Update: {
          aplica_a?: Database["public"]["Enums"]["aplica_a_tarifa"]
          clasificacion_id?: string | null
          created_at?: string
          descuento_max?: number | null
          descuento_pct?: number | null
          id?: string
          margen_pct?: number | null
          notas?: string | null
          precio?: number
          precio_minimo?: number | null
          producto_id?: string | null
          tarifa_id?: string
          tipo_calculo?: Database["public"]["Enums"]["tipo_calculo_tarifa"]
        }
        Relationships: [
          {
            foreignKeyName: "tarifa_lineas_clasificacion_id_fkey"
            columns: ["clasificacion_id"]
            isOneToOne: false
            referencedRelation: "clasificaciones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tarifa_lineas_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_empresa_id: { Args: never; Returns: string }
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
      status_producto: "activo" | "inactivo" | "borrador"
      tipo_calculo_tarifa: "margen_costo" | "descuento_precio" | "precio_fijo"
      tipo_comision: "porcentaje" | "monto_fijo"
      tipo_tarifa: "general" | "por_cliente" | "por_ruta"
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
      status_producto: ["activo", "inactivo", "borrador"],
      tipo_calculo_tarifa: ["margen_costo", "descuento_precio", "precio_fijo"],
      tipo_comision: ["porcentaje", "monto_fijo"],
      tipo_tarifa: ["general", "por_cliente", "por_ruta"],
    },
  },
} as const
