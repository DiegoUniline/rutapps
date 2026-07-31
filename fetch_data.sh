#!/bin/bash
URL="${VITE_SUPABASE_URL}/rest/v1"
KEY="${VITE_SUPABASE_ANON_KEY}"
START_DATE="2026-07-27"

# Fetch venta_lineas joined with ventas
# Note: we need to handle pagination if > 1000 lines
OFFSET=0
LIMIT=1000
ALL_DATA="[]"

while true; do
  RESPONSE=$(curl -s -G \
    -H "apikey: ${KEY}" \
    -H "Authorization: Bearer ${KEY}" \
    -H "Range: ${OFFSET}-$((OFFSET + LIMIT - 1))" \
    --data-urlencode "select=id,cantidad,precio_unitario,descuento_pct,iva_pct,ieps_pct,total,subtotal,iva_monto,ieps_monto,precio_unitario_sin_redondeo,ventas!inner(id,folio,created_at,status)" \
    --data-urlencode "ventas.created_at=gte.${START_DATE}" \
    --data-urlencode "ventas.status=neq.cancelado" \
    "${URL}/venta_lineas")
  
  COUNT=$(echo "$RESPONSE" | jq '. | length')
  if [ "$COUNT" -eq 0 ]; then break; fi
  
  # Fetch promotions for these lines
  LINE_IDS=$(echo "$RESPONSE" | jq -r '.[].id' | paste -sd "," -)
  PROMOS=$(curl -s -G \
    -H "apikey: ${KEY}" \
    -H "Authorization: Bearer ${KEY}" \
    --data-urlencode "venta_linea_id=in.(${LINE_IDS})" \
    "${URL}/promocion_aplicada")
  
  # Merge promos into lines (simple merge in jq)
  MERGED=$(echo "$RESPONSE" | jq --argjson promos "$PROMOS" 'map(
    . as $line | 
    $line + {
      linea_id: .id,
      folio: .ventas.folio,
      linea_total: .total,
      promocion_aplicada: ($promos | map(select(.venta_linea_id == $line.id)))
    }
  )')
  
  if [ "$ALL_DATA" == "[]" ]; then
    ALL_DATA="$MERGED"
  else
    ALL_DATA=$(echo "$ALL_DATA $MERGED" | jq -s 'add')
  fi

  if [ "$COUNT" -lt "$LIMIT" ]; then break; fi
  OFFSET=$((OFFSET + LIMIT))
done

echo "$ALL_DATA" > sales_data.json
