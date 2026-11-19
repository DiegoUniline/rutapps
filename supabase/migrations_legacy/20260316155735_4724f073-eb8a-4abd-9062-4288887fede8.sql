
-- Catálogo Régimen Fiscal SAT
CREATE TABLE public.cat_regimen_fiscal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  descripcion text NOT NULL,
  persona_fisica boolean DEFAULT true,
  persona_moral boolean DEFAULT true,
  activo boolean DEFAULT true
);
ALTER TABLE public.cat_regimen_fiscal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON public.cat_regimen_fiscal FOR SELECT TO public USING (true);

-- Catálogo Uso CFDI SAT
CREATE TABLE public.cat_uso_cfdi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  descripcion text NOT NULL,
  persona_fisica boolean DEFAULT true,
  persona_moral boolean DEFAULT true,
  activo boolean DEFAULT true
);
ALTER TABLE public.cat_uso_cfdi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON public.cat_uso_cfdi FOR SELECT TO public USING (true);

-- Catálogo Forma de Pago SAT
CREATE TABLE public.cat_forma_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  descripcion text NOT NULL,
  activo boolean DEFAULT true
);
ALTER TABLE public.cat_forma_pago ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON public.cat_forma_pago FOR SELECT TO public USING (true);

-- Catálogo Método de Pago SAT
CREATE TABLE public.cat_metodo_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  descripcion text NOT NULL,
  activo boolean DEFAULT true
);
ALTER TABLE public.cat_metodo_pago ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON public.cat_metodo_pago FOR SELECT TO public USING (true);

-- Catálogo Moneda SAT
CREATE TABLE public.cat_moneda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  descripcion text NOT NULL,
  activo boolean DEFAULT true
);
ALTER TABLE public.cat_moneda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON public.cat_moneda FOR SELECT TO public USING (true);

-- Catálogo Tipo Comprobante SAT
CREATE TABLE public.cat_tipo_comprobante (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  descripcion text NOT NULL,
  activo boolean DEFAULT true
);
ALTER TABLE public.cat_tipo_comprobante ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON public.cat_tipo_comprobante FOR SELECT TO public USING (true);

-- SEED: Régimen Fiscal
INSERT INTO public.cat_regimen_fiscal (clave, descripcion, persona_fisica, persona_moral) VALUES
('601', 'General de Ley Personas Morales', false, true),
('603', 'Personas Morales con Fines no Lucrativos', false, true),
('605', 'Sueldos y Salarios e Ingresos Asimilados a Salarios', true, false),
('606', 'Arrendamiento', true, false),
('607', 'Régimen de Enajenación o Adquisición de Bienes', true, false),
('608', 'Demás ingresos', true, false),
('609', 'Consolidación', false, true),
('610', 'Residentes en el Extranjero sin Establecimiento Permanente en México', true, true),
('611', 'Ingresos por Dividendos (socios y accionistas)', true, false),
('612', 'Personas Físicas con Actividades Empresariales y Profesionales', true, false),
('614', 'Ingresos por intereses', true, false),
('615', 'Régimen de los ingresos por obtención de premios', true, false),
('616', 'Sin obligaciones fiscales', true, false),
('620', 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos', false, true),
('621', 'Incorporación Fiscal', true, false),
('622', 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', true, true),
('623', 'Opcional para Grupos de Sociedades', false, true),
('624', 'Coordinados', false, true),
('625', 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', true, false),
('626', 'Régimen Simplificado de Confianza', true, true);

-- SEED: Uso CFDI
INSERT INTO public.cat_uso_cfdi (clave, descripcion, persona_fisica, persona_moral) VALUES
('G01', 'Adquisición de mercancías', true, true),
('G02', 'Devoluciones, descuentos o bonificaciones', true, true),
('G03', 'Gastos en general', true, true),
('I01', 'Construcciones', true, true),
('I02', 'Mobiliario y equipo de oficina por inversiones', true, true),
('I03', 'Equipo de transporte', true, true),
('I04', 'Equipo de cómputo y accesorios', true, true),
('I05', 'Dados, troqueles, moldes, matrices y herramental', true, true),
('I06', 'Comunicaciones telefónicas', true, true),
('I07', 'Comunicaciones satelitales', true, true),
('I08', 'Otra maquinaria y equipo', true, true),
('D01', 'Honorarios médicos, dentales y gastos hospitalarios', true, false),
('D02', 'Gastos médicos por incapacidad o discapacidad', true, false),
('D03', 'Gastos funerales', true, false),
('D04', 'Donativos', true, false),
('D05', 'Intereses reales efectivamente pagados por créditos hipotecarios', true, false),
('D06', 'Aportaciones voluntarias al SAR', true, false),
('D07', 'Primas por seguros de gastos médicos', true, false),
('D08', 'Gastos de transportación escolar obligatoria', true, false),
('D09', 'Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones', true, false),
('D10', 'Pagos por servicios educativos (colegiaturas)', true, false),
('S01', 'Sin efectos fiscales', true, true),
('CP01', 'Pagos', true, true);

-- SEED: Forma de Pago
INSERT INTO public.cat_forma_pago (clave, descripcion) VALUES
('01', 'Efectivo'),
('02', 'Cheque nominativo'),
('03', 'Transferencia electrónica de fondos'),
('04', 'Tarjeta de crédito'),
('05', 'Monedero electrónico'),
('06', 'Dinero electrónico'),
('08', 'Vales de despensa'),
('12', 'Dación en pago'),
('13', 'Pago por subrogación'),
('14', 'Pago por consignación'),
('15', 'Condonación'),
('17', 'Compensación'),
('23', 'Novación'),
('24', 'Confusión'),
('25', 'Remisión de deuda'),
('26', 'Prescripción o caducidad'),
('27', 'A satisfacción del acreedor'),
('28', 'Tarjeta de débito'),
('29', 'Tarjeta de servicios'),
('30', 'Aplicación de anticipos'),
('31', 'Intermediario pagos'),
('99', 'Por definir');

-- SEED: Método de Pago
INSERT INTO public.cat_metodo_pago (clave, descripcion) VALUES
('PUE', 'Pago en una sola exhibición'),
('PPD', 'Pago en parcialidades o diferido');

-- SEED: Moneda (las más comunes)
INSERT INTO public.cat_moneda (clave, descripcion) VALUES
('MXN', 'Peso Mexicano'),
('USD', 'Dólar americano'),
('EUR', 'Euro'),
('GBP', 'Libra Esterlina'),
('CAD', 'Dólar Canadiense'),
('JPY', 'Yen Japonés'),
('BRL', 'Real Brasileño'),
('COP', 'Peso Colombiano'),
('ARS', 'Peso Argentino'),
('CLP', 'Peso Chileno'),
('PEN', 'Sol Peruano'),
('XXX', 'Los códigos asignados para transacciones en que intervenga ninguna moneda');

-- SEED: Tipo Comprobante
INSERT INTO public.cat_tipo_comprobante (clave, descripcion) VALUES
('I', 'Ingreso'),
('E', 'Egreso'),
('T', 'Traslado'),
('N', 'Nómina'),
('P', 'Pago');
