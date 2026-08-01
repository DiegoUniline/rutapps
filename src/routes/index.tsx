export default function Index() { return <body>Analiza exclusivamente el pedido 1950 de la licencia 43129204 y, dentro de ese pedido, la línea correspondiente al producto:

PROMOCLORA · GRATIS CLORALEX 1.17L

No modifiques ningún dato todavía. Necesito primero un diagnóstico técnico comprobable.

PROBLEMA EXACTO

El producto promocional tiene un precio final de $0.01 con impuestos incluidos.

Sin embargo, actualmente el sistema continúa mostrando o guardando:

precio sin impuestos: $0.01

IVA: $0.00

precio con impuestos: $0.01

Esto es incorrecto porque PROMOCLORA · GRATIS CLORALEX 1.17L sí causa IVA.

El sistema debe considerar el centavo como precio final con impuestos incluidos y desglosar el IVA.

Con IVA del 16%, el cálculo matemático esperado por unidad es:

precio final con impuestos: $0.01

base sin IVA: $0.01 / 1.16 = $0.0086206897

IVA: $0.01 - $0.0086206897 = $0.0013793103

Por lo tanto, internamente debería conservarse aproximadamente:

precio_unitario_sin_impuestos: $0.0086206897

base_iva: $0.0086206897

iva_monto_unitario: $0.0013793103

precio_unitario_con_impuestos: $0.01

IMPORTANTE SOBRE EL REDONDEO

No concluyas que el cálculo es correcto únicamente porque en la interfaz ambos valores se visualizan como $0.01 o porque el IVA se visualiza como $0.00.

A dos decimales:

$0.0086206897 se muestra como $0.01

$0.0013793103 se muestra como $0.00

Necesito que revises los valores reales almacenados en base de datos con todos sus decimales.

VALIDACIONES OBLIGATORIAS

Confirma que estás consultando exclusivamente:

licencia: 43129204

pedido: 1950

producto: PROMOCLORA · GRATIS CLORALEX 1.17L

No uses información de otras licencias, pedidos o productos.

Muestra la línea real de la base de datos con todos sus decimales:

ID o UUID de la línea

producto_id

producto_uuid

nombre del producto

cantidad

precio_lista_unitario

precio_unitario_sin_impuestos

precio_unitario_con_impuestos

base_iva

iva_pct

iva_monto

impuestos_totales

descuento_promocion_monto

descuento_manual_monto

descuento_total_monto

importe_bruto

importe_neto

es_bonificacion

promocion_id

promocion_nombre

objeto_impuesto

No redondees los resultados a dos decimales en el diagnóstico.

Consulta la configuración fiscal real del producto dentro de la licencia 43129204:

tiene_iva

iva_pct

tiene_ieps

ieps_pct

objeto_impuesto

precio_incluye_impuestos

clave SAT, si aplica

Confirma si el producto está configurado con IVA del 16%.

Identifica exactamente dónde se asigna el valor de $0.01.

Determina si el sistema está haciendo alguna de estas operaciones:

asignar $0.01 directamente a precio_unitario_sin_impuestos;

asignar $0.01 como precio final con impuestos incluidos;

asignar $0.01 a ambos campos;

poner el IVA en cero por tratarse de una bonificación;

omitir impuestos cuando es_bonificacion = true;

aplicar un precio mínimo después del cálculo fiscal;

redondear antes de separar los impuestos;

recalcular incorrectamente la base después de aplicar la promoción.

Revisa específicamente la lógica utilizada para productos promocionales, gratuitos o bonificados.

Es posible que la corrección se haya aplicado al flujo normal de venta, pero no al flujo que procesa:

productos gratis;

productos bonificados;

promociones de tipo regalo;

líneas con precio mínimo de $0.01;

productos agregados automáticamente por una promoción.

Identifica si existe una función, servicio, trigger, endpoint o bloque condicional diferente para estas líneas.

Busca condiciones similares a:

es_bonificacion

precio_promocional

precio_minimo

precio = 0.01

Math.max

round

toFixed

impuestos = 0

tiene_iva = false

producto_gratis

linea_promocional

regalo

bonificacion

Indica el archivo, función y línea donde se genera el comportamiento.

Valida el orden correcto del cálculo.

El flujo correcto debería ser:

a. Obtener la configuración fiscal del producto.

b. Determinar que el precio promocional final es $0.01 con impuestos incluidos.

c. Extraer el IVA del precio final:

base = precio_final / 1.16

IVA = precio_final - base

d. Guardar la base y el impuesto con suficiente precisión decimal.

e. Mantener el total final de la línea en $0.01.

No debe realizarse este flujo incorrecto:

a. Asignar precio sin impuestos = $0.01.

b. Calcular IVA sobre $0.01.

c. Forzar nuevamente el total a $0.01.

Tampoco debe asignarse IVA = $0.00 únicamente porque el producto es gratuito o promocional.

Compara los siguientes tres resultados:

valores guardados actualmente en la base de datos;

valores calculados actualmente por el backend;

valores mostrados por el frontend.

Revisa si el pedido 1950 es histórico.

Confirma:

fecha de creación del pedido;

fecha de creación de la línea;

fecha de actualización;

si fue creado antes o después de la corrección;

si la corrección solo funciona en pedidos nuevos;

si el pedido 1950 nunca fue recalculado.

No me respondas únicamente que “ya está corregido”.

Necesito evidencia concreta:

consulta de base de datos;

valores antes del cálculo;

valores después del cálculo;

función utilizada;

condición que estaba fallando;

resultado de una prueba nueva con el mismo producto y promoción.

PRUEBA REQUERIDA

Realiza una prueba controlada, sin modificar el pedido 1950, usando la licencia 43129204 y el mismo producto PROMOCLORA · GRATIS CLORALEX 1.17L.

Para una unidad con precio final promocional de $0.01 e IVA del 16%, el resultado interno esperado es:

base sin IVA: 0.0086206897

IVA: 0.0013793103

total con IVA: 0.0100000000

La suma debe cumplir:

base sin IVA + IVA = precio final con impuestos

ENTREGA EL DIAGNÓSTICO CON ESTA ESTRUCTURA

Datos reales de la línea del pedido 1950

Configuración fiscal real del producto

Lugar exacto donde se asigna el precio de $0.01

Lógica aplicada a productos promocionales o bonificados

Valores guardados actualmente

Valores matemáticamente correctos

Diferencia entre backend, base de datos y frontend

Motivo por el que la corrección anterior no se está aplicando

Archivo, función o endpoint que debe corregirse

Propuesta de corrección sin ejecutarla

No menciones Vualá.

No menciones Cloralex de otras presentaciones.

No mezcles esta línea con otras promociones.

No afirmes que está corregido sin demostrar el desglose fiscal real con todos sus decimales.</body>; }
