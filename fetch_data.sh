#!/bin/bash
URL="${VITE_SUPABASE_URL}/rest/v1"
KEY="${VITE_SUPABASE_ANON_KEY}"
START_DATE="2026-07-27"

# Fetch sales
SALES=$(curl -s -G \
  -H "apikey: ${KEY}" \
  -H "Authorization: Bearer ${KEY}" \
  --data-urlencode "created_at=gte.${START_DATE}" \
  --data-urlencode "status=neq.cancelado" \
  --data-urlencode "select=id,folio" \
  "${URL}/ventas")

SALE_IDS=$(echo "$SALES" | jq -r '.[].id' | paste -sd "," -)

if [ -z "$SALE_IDS" ]; then
  echo "[]" > sales_data.json
  exit 0
fi

# Fetch lines for these sales
# PostgREST IN filter has a limit on the number of elements. 
# We'll fetch in batches if needed.
# But for now, let's try to fetch all lines since START_DATE directly if possible.
# venta_lineas doesn't have created_at, so we join.

# We'll use the ID list in batches of 200
IFS=',' read -ra ADDR <<< "$SALE_IDS"
ALL_LINES="[]"
for ((i=0; i<${#ADDR[@]}; i+=200)); do
  BATCH=$(IFS=,; echo "${ADDR[*]:i:200}")
  LINES=$(curl -s -G \
    -H "apikey: ${KEY}" \
    -H "Authorization: Bearer ${KEY}" \
    --data-urlencode "venta_id=in.(${BATCH})" \
    --data-urlencode "select=id,venta_id,cantidad,precio_unitario,descuento_pct,iva_pct,ieps_pct,total,subtotal,iva_monto,ieps_monto,precio_unitario_sin_redondeo" \
    "${URL}/venta_lineas")
  
  # Merge folio from SALES
  MERGED=$(echo "$LINES" | jq --argjson sales "$SALES" 'map(
    . as $line | 
    (.venta_id) as $vid |
    ($sales | map(select(.id == $vid)) | .[0].folio) as $folio |
    $line + {
      linea_id: .id,
      folio: $folio,
      linea_total: .total,
      promocion_aplicada: []
    }
  )')
  
  ALL_LINES=$(echo "$ALL_LINES $MERGED" | jq -s 'add')
done

echo "$ALL_LINES" > sales_data.json
