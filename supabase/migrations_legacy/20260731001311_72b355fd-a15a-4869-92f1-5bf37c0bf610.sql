
do $$
declare
  v_emp uuid := '6d849e12-6437-4b24-917d-a89cc9b2fa88';
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid;
  alm_principal uuid := 'ccc730a0-07a5-41ce-83ef-3eb8cccfd9f8';
  alm_ruta uuid := 'f7a321be-4fb5-4b06-be08-c39ae6d3d639';
  hoy date := (now() at time zone 'America/Mexico_City')::date;
begin
  delete from promociones where empresa_id=v_emp and nombre like 'TEST %';
  delete from productos where empresa_id=v_emp and nombre in (
    'TEST A Refresco 600ml','TEST B Galleta','TEST C Jabon (IVA 16%)',
    'TEST D Agua 1L (regalo)','TEST E Cereal','TEST F Cafe');

  insert into productos (empresa_id, codigo, nombre, precio_principal, costo, status, tiene_iva, iva_pct, vender_sin_stock, almacenes)
  values
    (v_emp,'PRM-A','PROMO A Refresco 600ml',10,5,'activo',false,0,true,array[alm_principal,alm_ruta]),
    (v_emp,'PRM-B','PROMO B Galleta',20,10,'activo',false,0,true,array[alm_principal,alm_ruta]),
    (v_emp,'PRM-C','PROMO C Jabon IVA 16',50,25,'activo',true,16,true,array[alm_principal,alm_ruta]),
    (v_emp,'PRM-D','PROMO D Agua 1L (regalo)',8,4,'activo',false,0,true,array[alm_principal,alm_ruta]),
    (v_emp,'PRM-E','PROMO E Cereal',100,50,'activo',false,0,true,array[alm_principal,alm_ruta]),
    (v_emp,'PRM-F','PROMO F Cafe',25,12,'activo',false,0,true,array[alm_principal,alm_ruta]);

  select id into a from productos where empresa_id=v_emp and codigo='PRM-A';
  select id into b from productos where empresa_id=v_emp and codigo='PRM-B';
  select id into c from productos where empresa_id=v_emp and codigo='PRM-C';
  select id into d from productos where empresa_id=v_emp and codigo='PRM-D';
  select id into e from productos where empresa_id=v_emp and codigo='PRM-E';
  select id into f from productos where empresa_id=v_emp and codigo='PRM-F';

  insert into stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
  select v_emp, al, pr, 1000
  from unnest(array[alm_principal, alm_ruta]) al, unnest(array[a,b,c,d,e,f]) pr
  on conflict (almacen_id, producto_id) do update set cantidad = 1000;

  insert into promociones (empresa_id,nombre,descripcion,tipo,aplica_a,activa,valor,cantidad_minima,cantidad_gratis,producto_gratis_id,producto_ids,prioridad,acumulable,vigencia_inicio,vigencia_fin,dias_semana)
  values
   (v_emp,'TEST 1 · 3x2 mismo producto (A)','Cada 3 de PROMO A, 1 gratis','producto_gratis','producto',true,0,3,1,a,array[a],10,false,null,null,'{}'),
   (v_emp,'TEST 2 · Compra 2 B llevate 1 D','Regalo cruzado','producto_gratis','producto',true,0,2,1,d,array[b],9,false,null,null,'{}'),
   (v_emp,'TEST 3 · 10% en C','Descuento porcentaje acumulable','descuento_porcentaje','producto',true,10,1,0,null,array[c],5,true,null,null,'{}'),
   (v_emp,'TEST 4 · $5 desc/u en E (min 2)','Descuento monto acumulable','descuento_monto','producto',true,5,2,0,null,array[e],4,true,null,null,'{}'),
   (v_emp,'TEST 5 · Precio especial $80 en E (min 5)','Precio especial no acumulable','precio_especial','producto',true,80,5,0,null,array[e],8,false,null,null,'{}'),
   (v_emp,'TEST 6 · Volumen 15% en F (min 12)','Descuento por volumen','volumen','producto',true,15,12,0,null,array[f],3,false,null,null,'{}'),
   (v_emp,'TEST 7 · Multi-disparador A+B regala D','Cada 5 unidades sumadas de A y B, 1 D gratis','producto_gratis','producto',true,0,5,1,d,array[a,b],2,true,null,null,'{}'),
   (v_emp,'TEST 8 · Solo domingo 50% en F','No debe aplicar fuera de domingo','descuento_porcentaje','producto',true,50,1,0,null,array[f],1,true,null,null,array['domingo']),
   (v_emp,'TEST 9 · Vencida 90% en A','No debe aplicar nunca','descuento_porcentaje','producto',true,90,1,0,null,array[a],20,true,hoy - 30,hoy - 5,'{}');
end $$;
