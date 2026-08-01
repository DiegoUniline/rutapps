import React, { useEffect, useState } from 'react';

const Index = () => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    // The data extracted via supabase--read_query for PED-0001
    const pedido = {
      venta: {
        id: "43e5c67b-1817-4664-87bd-be5568bacc8e",
        folio: "PED-0001",
        fecha: "2026-07-31",
        total: 28.00,
        descuento_total: 0,
        subtotal: 22.34,
        iva_total: 3.87,
        ieps_total: 1.79,
        status: "confirmado",
        empresa_id: "6d849e12-6437-4b24-917d-a89cc9b2fa88",
        cliente_id: "1ab00665-a08d-4ab1-941e-16f61afd206b",
        vendedor_id: "f71fec41-33ac-409b-94b7-b30f502ef807",
        politica_cobro: "entregado",
        tarifa_id: "6a6e7466-333e-4a1e-ae8b-6370b7f3452c",
        almacen_id: "ccc730a0-07a5-41ce-83ef-3eb8cccfd9f8"
      },
      lineas: [
        {
          id: "9b24c69f-ffdf-4817-ad1b-91c519a60741",
          venta_id: "43e5c67b-1817-4664-87bd-be5568bacc8e",
          producto_id: "c64e5eb6-4d8a-4d64-a0e3-6d7516f01cdb",
          descripcion: "Coca Cola 600 Ml",
          cantidad: 3,
          cantidad_bonificada: 1,
          es_bonificacion: false,
          precio_lista_unitario: 11,
          importe_bruto: 42,
          precio_unitario: 11.174968071519796,
          precio_unitario_sin_redondeo: 11,
          descuento_promocion_monto: 14,
          base_descuento_manual: 28,
          descuento_manual: false,
          descuento_manual_monto: 0,
          descuento_total_monto: 14,
          motivo_descuento_manual: null,
          descuento_registrado_por: null,
          promocion_id: "a7c0cb11-92ed-4b57-b27b-063c69c99201",
          promocion_nombre: "3X2",
          base_ieps: 22.34,
          ieps_pct: 8,
          ieps_monto: 1.79,
          base_iva: 24.13,
          iva_pct: 16,
          iva_monto: 3.87,
          impuestos_totales: 5.66,
          subtotal: 22.34,
          total: 28,
          objeto_impuesto: null
        }
      ]
    };
    setData(pedido);
  }, []);

  if (!data) return <div className="p-8 font-mono">Cargando datos...</div>;

  return (
    <div className="p-8 bg-slate-50 min-h-screen font-mono text-sm overflow-auto">
      <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h1 className="text-xl font-bold mb-4 text-slate-800">JSON Detalle Pedido PED-0001</h1>
        <pre className="p-4 bg-slate-900 text-green-400 rounded overflow-x-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default Index;
