import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/signup" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>

        <h1 className="text-3xl font-black text-foreground mb-2">Aviso de Privacidad</h1>
        <p className="text-sm text-muted-foreground mb-8">Última actualización: marzo 2026</p>

        <div className="prose prose-sm max-w-none text-foreground/90 space-y-6">
          <section>
            <h2 className="text-lg font-bold text-foreground">1. Responsable del Tratamiento</h2>
            <p>RutApp ("la Empresa") es responsable del tratamiento de los datos personales recabados a través de la plataforma, de conformidad con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">2. Datos Personales Recabados</h2>
            <p>Recabamos los siguientes datos personales:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Datos de identificación:</strong> Nombre completo, correo electrónico, número telefónico.</li>
              <li><strong>Datos de la empresa:</strong> Nombre comercial, razón social, RFC, régimen fiscal, domicilio fiscal, código postal.</li>
              <li><strong>Datos financieros:</strong> Información de facturación procesada por Stripe (no almacenamos datos de tarjetas).</li>
              <li><strong>Datos de uso:</strong> Registros de actividad, direcciones IP, tipo de dispositivo, ubicación GPS (cuando se autoriza explícitamente).</li>
              <li><strong>Datos fiscales:</strong> Certificados de Sello Digital (CSD), Constancias de Situación Fiscal.</li>
              <li><strong>Datos de clientes del Usuario:</strong> Información comercial de los clientes que el Usuario registra en la plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">3. Finalidades del Tratamiento</h2>
            <p><strong>Finalidades primarias (necesarias):</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Crear y administrar su cuenta de usuario.</li>
              <li>Proveer los servicios contratados (ventas, inventario, facturación, logística).</li>
              <li>Procesar pagos y gestionar suscripciones.</li>
              <li>Emitir comprobantes fiscales digitales (CFDI) ante el SAT.</li>
              <li>Verificar la identidad del Usuario mediante código de WhatsApp.</li>
              <li>Enviar notificaciones operativas del Servicio.</li>
              <li>Cumplir con obligaciones legales y fiscales.</li>
            </ul>
            <p className="mt-3"><strong>Finalidades secundarias (opcionales):</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Enviar comunicaciones promocionales o informativas sobre nuevas funcionalidades.</li>
              <li>Realizar análisis estadísticos para mejorar el Servicio.</li>
              <li>Compartir información con socios comerciales para ofrecer servicios complementarios.</li>
            </ul>
            <p className="mt-2 text-sm">Si no desea que sus datos se utilicen para finalidades secundarias, puede manifestarlo al momento del registro o contactándonos posteriormente.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">4. Transferencias de Datos</h2>
            <p>Sus datos pueden ser transferidos a:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Stripe, Inc.</strong> — Para procesamiento de pagos (EE.UU., cumple con estándares PCI DSS).</li>
              <li><strong>Supabase, Inc.</strong> — Para almacenamiento en la nube y autenticación (EE.UU.).</li>
              <li><strong>Facturama / API de Facturación</strong> — Para la emisión de CFDI ante el SAT (México).</li>
              <li><strong>WhatsAPI / Proveedor de mensajería</strong> — Para envío de notificaciones y verificación.</li>
              <li><strong>Autoridades fiscales (SAT)</strong> — Cuando sea requerido por ley.</li>
            </ul>
            <p className="mt-2">Estas transferencias se realizan conforme a la LFPDPPP y los contratos correspondientes con cada proveedor.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">5. Derechos ARCO</h2>
            <p>Usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse al tratamiento de sus datos personales (derechos ARCO). Para ejercer estos derechos, envíe una solicitud a través de los canales de soporte de la plataforma indicando:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nombre completo y correo electrónico asociado a la cuenta.</li>
              <li>Descripción clara del derecho que desea ejercer.</li>
              <li>Documentos que acrediten su identidad.</li>
            </ul>
            <p className="mt-2">Responderemos en un plazo máximo de 20 días hábiles.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">6. Medidas de Seguridad</h2>
            <p>Implementamos medidas de seguridad administrativas, técnicas y físicas para proteger sus datos:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Cifrado de datos en tránsito (TLS/SSL) y en reposo.</li>
              <li>Políticas de acceso basadas en roles (RLS - Row Level Security).</li>
              <li>Autenticación de dos factores y verificación por WhatsApp.</li>
              <li>Aislamiento de datos multi-tenant (cada empresa solo accede a sus propios datos).</li>
              <li>Respaldos automáticos y redundancia geográfica.</li>
              <li>Monitoreo continuo de accesos y actividad sospechosa.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">7. Cookies y Tecnologías de Rastreo</h2>
            <p>Utilizamos cookies y almacenamiento local del navegador exclusivamente para:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Mantener su sesión activa.</li>
              <li>Almacenar preferencias de configuración.</li>
              <li>Funcionalidad offline de la aplicación (PWA).</li>
            </ul>
            <p>No utilizamos cookies de terceros con fines publicitarios.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">8. Conservación de Datos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Los datos se conservan mientras la cuenta esté activa.</li>
              <li>Tras la cancelación, los datos se retienen 30 días antes de ser eliminados permanentemente.</li>
              <li>Los datos fiscales (CFDI) se conservan por el periodo requerido por la legislación mexicana (5 años).</li>
              <li>Los registros de facturación se mantienen conforme a las obligaciones contables aplicables.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">9. Datos de Menores</h2>
            <p>El Servicio no está dirigido a menores de 18 años. No recabamos intencionalmente datos de menores. Si detectamos que un menor ha proporcionado datos personales, procederemos a eliminarlos.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">10. Modificaciones al Aviso de Privacidad</h2>
            <p>Nos reservamos el derecho de modificar este Aviso de Privacidad. Los cambios serán notificados a través de la plataforma y/o por correo electrónico. La fecha de última actualización siempre será visible al inicio del documento.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">11. Contacto</h2>
            <p>Para consultas sobre privacidad y protección de datos, utilice los canales de soporte disponibles en la plataforma.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
