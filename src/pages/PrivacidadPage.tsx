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
            <p>RutApp ("la Empresa") es responsable del tratamiento de los datos personales recabados a través de la plataforma, de conformidad con la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP) y su Reglamento. Domicilio: Guadalajara, Jalisco, México.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">2. Datos Personales Recabados</h2>
            <p>Recabamos los siguientes datos personales:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Datos de identificación:</strong> Nombre completo, correo electrónico, número telefónico.</li>
              <li><strong>Datos de la empresa:</strong> Nombre comercial, razón social, RFC, régimen fiscal, domicilio fiscal, código postal.</li>
              <li><strong>Datos financieros:</strong> Información de facturación procesada por Stripe (no almacenamos datos de tarjetas de crédito o débito en nuestros servidores).</li>
              <li><strong>Datos de uso:</strong> Registros de actividad, direcciones IP, tipo de dispositivo, sistema operativo, ubicación GPS (cuando se autoriza explícitamente para funciones de ruta y logística).</li>
              <li><strong>Datos fiscales:</strong> Certificados de Sello Digital (CSD), Constancias de Situación Fiscal, datos de emisión de CFDI.</li>
              <li><strong>Datos de clientes del Usuario:</strong> Información comercial de los clientes que el Usuario registra en la plataforma (nombres, direcciones, teléfonos, RFC, datos de facturación).</li>
              <li><strong>Datos de verificación:</strong> Códigos OTP enviados por WhatsApp o correo electrónico para verificación de identidad.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">3. Finalidades del Tratamiento</h2>
            <p><strong>Finalidades primarias (necesarias):</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Crear y administrar su cuenta de usuario y empresa.</li>
              <li>Proveer los servicios contratados (ventas, inventario, facturación, logística, cobranza, punto de venta).</li>
              <li>Procesar pagos, gestionar suscripciones y ejecutar cobros automáticos recurrentes.</li>
              <li>Emitir comprobantes fiscales digitales (CFDI) ante el SAT.</li>
              <li>Verificar la identidad del Usuario mediante código de WhatsApp o correo electrónico.</li>
              <li>Enviar notificaciones operativas del Servicio (cobros, vencimientos, alertas de sistema).</li>
              <li>Generar reportes y análisis de la actividad comercial del Usuario.</li>
              <li>Cumplir con obligaciones legales, fiscales y regulatorias.</li>
              <li>Gestionar la cancelación, baja y eliminación de cuentas.</li>
            </ul>
            <p className="mt-3"><strong>Finalidades secundarias (opcionales):</strong></p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Enviar comunicaciones promocionales o informativas sobre nuevas funcionalidades.</li>
              <li>Realizar análisis estadísticos y de uso para mejorar el Servicio.</li>
              <li>Compartir información con socios comerciales para ofrecer servicios complementarios.</li>
              <li>Personalizar la experiencia del Usuario dentro de la plataforma.</li>
            </ul>
            <p className="mt-2 text-sm">Si no desea que sus datos se utilicen para finalidades secundarias, puede manifestarlo al momento del registro o contactándonos posteriormente.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">4. Datos Financieros y Cobro Automático</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Los datos de pago (tarjeta de crédito/débito) son procesados exclusivamente por Stripe, Inc. y nunca se almacenan en los servidores de RutApp.</li>
              <li>Al registrar un método de pago, el Usuario autoriza a Stripe a procesar cobros recurrentes mensuales según el plan contratado.</li>
              <li>Stripe cumple con los estándares PCI DSS Nivel 1 para la seguridad de datos de tarjetas.</li>
              <li>La Empresa conserva registros de transacciones (montos, fechas, estados de pago) para fines contables y de soporte.</li>
              <li>El Usuario puede actualizar o eliminar su método de pago en cualquier momento, entendiendo que la eliminación puede resultar en la suspensión del servicio.</li>
              <li>En caso de transferencias bancarias, se conservan los datos de referencia necesarios para la conciliación del pago.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">5. Transferencias de Datos</h2>
            <p>Sus datos pueden ser transferidos a:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Stripe, Inc.</strong> — Para procesamiento de pagos y cobros automáticos (EE.UU., cumple con estándares PCI DSS).</li>
              <li><strong>Supabase, Inc.</strong> — Para almacenamiento en la nube, autenticación y funciones de backend (EE.UU.).</li>
              <li><strong>Facturama / API de Facturación</strong> — Para la emisión de CFDI ante el SAT (México).</li>
              <li><strong>WhatsAPI / Proveedor de mensajería</strong> — Para envío de notificaciones, verificación OTP y comunicación comercial.</li>
              <li><strong>Google Maps Platform</strong> — Para funciones de geolocalización, mapas y optimización de rutas.</li>
              <li><strong>Autoridades fiscales (SAT)</strong> — Cuando sea requerido por ley para la emisión y validación de CFDI.</li>
            </ul>
            <p className="mt-2">Estas transferencias se realizan conforme a la LFPDPPP y los contratos correspondientes con cada proveedor. Los proveedores internacionales cumplen con estándares de protección de datos equivalentes o superiores a los de la legislación mexicana.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">6. Derechos ARCO</h2>
            <p>Usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse al tratamiento de sus datos personales (derechos ARCO). Para ejercer estos derechos, envíe una solicitud a través de los canales de soporte de la plataforma o al correo soporte@rutapp.com indicando:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nombre completo y correo electrónico asociado a la cuenta.</li>
              <li>Descripción clara del derecho que desea ejercer.</li>
              <li>Documentos que acrediten su identidad (identificación oficial vigente).</li>
            </ul>
            <p className="mt-2">Responderemos en un plazo máximo de 20 días hábiles. El ejercicio del derecho de cancelación está sujeto a las excepciones legales aplicables (por ejemplo, conservación de datos fiscales).</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">7. Medidas de Seguridad</h2>
            <p>Implementamos medidas de seguridad administrativas, técnicas y físicas para proteger sus datos:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Cifrado de datos en tránsito (TLS/SSL) y en reposo.</li>
              <li>Políticas de acceso basadas en roles (RLS - Row Level Security) a nivel de base de datos.</li>
              <li>Autenticación segura con verificación por WhatsApp/correo y soporte para contraseñas robustas.</li>
              <li>Aislamiento de datos multi-tenant (cada empresa solo accede a sus propios datos).</li>
              <li>Respaldos automáticos diarios y redundancia geográfica.</li>
              <li>Monitoreo continuo de accesos y actividad sospechosa.</li>
              <li>Procesamiento de pagos delegado a Stripe con certificación PCI DSS.</li>
              <li>No almacenamiento de datos de tarjetas de crédito/débito en nuestros servidores.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">8. Cookies y Tecnologías de Rastreo</h2>
            <p>Utilizamos cookies y almacenamiento local del navegador exclusivamente para:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Mantener su sesión activa de forma segura.</li>
              <li>Almacenar preferencias de configuración y tema visual.</li>
              <li>Funcionalidad offline de la aplicación (PWA) para uso en campo sin conexión.</li>
              <li>Sincronización de datos pendientes cuando se restablece la conexión.</li>
            </ul>
            <p>No utilizamos cookies de terceros con fines publicitarios ni de rastreo.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">9. Conservación y Eliminación de Datos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Los datos se conservan mientras la cuenta esté activa y el servicio esté vigente.</li>
              <li>Tras la cancelación de la suscripción, los datos se retienen por 30 días naturales para permitir la reactivación.</li>
              <li>Transcurridos los 30 días, los datos comerciales (ventas, clientes, inventario, configuraciones) se eliminan permanentemente.</li>
              <li>Los datos fiscales (CFDI emitidos, XML, PDF) se conservan por el periodo mínimo requerido por la legislación fiscal mexicana (5 años), incluso después de la baja.</li>
              <li>Los registros de facturación y pagos se mantienen conforme a las obligaciones contables aplicables.</li>
              <li>Los registros de verificación OTP se eliminan automáticamente después de 24 horas.</li>
              <li>Al solicitar la baja definitiva de cuenta, el proceso de eliminación es irreversible. La Empresa no podrá recuperar datos una vez completado.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">10. Portabilidad de Datos</h2>
            <p>El Usuario puede solicitar una copia de sus datos en formato exportable (CSV/Excel) para las siguientes categorías: productos, clientes, ventas, inventario y reportes. La solicitud se procesará dentro de los 10 días hábiles siguientes. Las exportaciones de datos fiscales incluirán los archivos XML y PDF correspondientes.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">11. Datos de Menores</h2>
            <p>El Servicio no está dirigido a menores de 18 años. No recabamos intencionalmente datos de menores. Si detectamos que un menor ha proporcionado datos personales, procederemos a eliminarlos de inmediato.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">12. Notificaciones y Comunicaciones</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Las comunicaciones operativas (cobros, vencimientos, alertas de sistema, cambios en el servicio) se enviarán al correo electrónico y/o WhatsApp registrado.</li>
              <li>Las comunicaciones promocionales se enviarán únicamente si el Usuario no ha manifestado su oposición.</li>
              <li>El Usuario puede gestionar sus preferencias de comunicación desde la configuración de su cuenta.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">13. Modificaciones al Aviso de Privacidad</h2>
            <p>Nos reservamos el derecho de modificar este Aviso de Privacidad. Los cambios serán notificados a través de la plataforma y/o por correo electrónico con al menos 15 días de anticipación. La fecha de última actualización siempre será visible al inicio del documento. El uso continuado del Servicio constituye la aceptación de las modificaciones.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">14. Contacto</h2>
            <p>Para consultas sobre privacidad, protección de datos o para ejercer sus derechos ARCO, utilice los canales de soporte disponibles en la plataforma o escriba a soporte@rutapp.com.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
