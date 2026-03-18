import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <Link to="/signup" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Link>

        <h1 className="text-3xl font-black text-foreground mb-2">Términos y Condiciones de Uso</h1>
        <p className="text-sm text-muted-foreground mb-8">Última actualización: marzo 2026</p>

        <div className="prose prose-sm max-w-none text-foreground/90 space-y-6">
          <section>
            <h2 className="text-lg font-bold text-foreground">1. Aceptación de los Términos</h2>
            <p>Al acceder, registrarse o utilizar la plataforma RutApp ("el Servicio"), usted acepta estos Términos y Condiciones en su totalidad. Si no está de acuerdo con alguna parte, no debe utilizar el Servicio. Estos términos constituyen un acuerdo legalmente vinculante entre usted ("el Usuario") y RutApp ("la Empresa"). El uso continuado del Servicio después de la publicación de cambios a estos Términos implica su aceptación.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">2. Descripción del Servicio</h2>
            <p>RutApp es una plataforma de gestión empresarial en la nube (SaaS) que incluye, entre otras funcionalidades: gestión de ventas, inventario, facturación electrónica CFDI 4.0, logística de entregas, control de rutas, cobranza, punto de venta, reportes y comunicación por WhatsApp. El Servicio se ofrece "tal cual" y puede ser actualizado, modificado o discontinuado en cualquier momento.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">3. Registro y Cuenta</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>El Usuario debe proporcionar información veraz, completa y actualizada durante el registro.</li>
              <li>El correo electrónico y teléfono proporcionados deben ser únicos y no estar asociados a otra empresa registrada.</li>
              <li>Cada cuenta es personal e intransferible. El Usuario es responsable de mantener la confidencialidad de sus credenciales.</li>
              <li>El Usuario debe ser mayor de 18 años o tener capacidad legal para contratar.</li>
              <li>La verificación de identidad mediante código por WhatsApp o correo electrónico es obligatoria para completar el registro.</li>
              <li>El Usuario es responsable de todas las actividades realizadas bajo su cuenta.</li>
              <li>La Empresa se reserva el derecho de rechazar, suspender o cancelar cuentas a su discreción.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">4. Planes, Pagos y Suscripciones</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>El Servicio incluye un periodo de prueba gratuito de 7 días naturales a partir de la fecha de registro.</li>
              <li>Al finalizar el periodo de prueba, se otorgan 3 días de gracia adicionales antes de suspender el acceso.</li>
              <li>Los pagos se procesan de forma segura mediante Stripe. La Empresa no almacena datos de tarjetas de crédito o débito.</li>
              <li>Las suscripciones se renuevan automáticamente de forma mensual salvo cancelación previa por parte del Usuario.</li>
              <li>Los precios de los planes se expresan en la moneda indicada al momento de la contratación y no incluyen impuestos locales salvo que se indique lo contrario.</li>
              <li>Los timbres fiscales (créditos de facturación electrónica) son no reembolsables una vez adquiridos.</li>
              <li>La Empresa se reserva el derecho de modificar los precios de los planes con aviso previo de 30 días naturales.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">5. Cobro Automático y Facturación</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Al contratar un plan de pago, el Usuario autoriza expresamente el cobro automático recurrente mensual a través de Stripe mediante el método de pago registrado (tarjeta de crédito, débito u otro medio aceptado).</li>
              <li>El cobro se realizará el primer día de cada ciclo de facturación. Si el plan fue contratado a mitad de mes, el primer cargo será prorrateado por los días restantes del mes.</li>
              <li>Si el cobro automático falla, la Empresa intentará cobrar hasta 3 veces adicionales en un periodo de 7 días naturales antes de suspender el servicio.</li>
              <li>El Usuario puede actualizar su método de pago en cualquier momento desde su panel de suscripción.</li>
              <li>Los cambios de plan (upgrade/downgrade) se aplican de forma inmediata con ajuste prorrateado al siguiente ciclo de facturación.</li>
              <li>El aumento de usuarios (asientos) dentro de un plan genera un cargo prorrateado inmediato por los días restantes del periodo actual.</li>
              <li>La Empresa puede ofrecer pagos por transferencia bancaria como método alternativo, sujeto a aprobación manual.</li>
              <li>Se emitirá un comprobante o recibo por cada cargo realizado, disponible en el historial de facturación del Usuario.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">6. Cancelación de Suscripción</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>El Usuario puede cancelar su suscripción en cualquier momento desde la sección "Mi Suscripción" en su panel de control.</li>
              <li>Al cancelar, el acceso al Servicio se mantiene activo hasta el final del periodo de facturación ya pagado.</li>
              <li>No se realizan reembolsos parciales por periodos no utilizados, salvo lo dispuesto en la sección de Política de Reembolso.</li>
              <li>La Empresa puede ofrecer incentivos de retención (descuentos) al momento de la cancelación, que el Usuario puede aceptar o rechazar libremente.</li>
              <li>Tras la cancelación efectiva, los datos del Usuario se conservarán por 30 días naturales, durante los cuales puede reactivar su cuenta. Pasado este periodo, los datos serán eliminados permanentemente, excepto aquellos que la ley obligue a conservar.</li>
              <li>Los timbres fiscales no utilizados al momento de la cancelación se pierden y no son transferibles ni reembolsables.</li>
              <li>La reactivación de una cuenta cancelada estará sujeta a la disponibilidad de los datos y puede requerir un nuevo periodo de configuración.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">7. Política de Reembolso</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>El periodo de prueba gratuito no genera cargo alguno y no requiere reembolso.</li>
              <li>Los cargos mensuales de suscripción no son reembolsables una vez procesados, excepto en casos de cobros duplicados o errores comprobados del sistema.</li>
              <li>Las compras de timbres fiscales no son reembolsables bajo ninguna circunstancia.</li>
              <li>En caso de disputas de cobro, el Usuario debe contactar al soporte dentro de los 15 días naturales posteriores al cargo.</li>
              <li>La Empresa evaluará cada solicitud de reembolso caso por caso y se reserva la decisión final.</li>
              <li>Los reembolsos aprobados se procesarán al mismo método de pago original en un plazo de 5 a 10 días hábiles.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">8. Baja de Cuenta y Eliminación de Datos</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>El Usuario puede solicitar la baja permanente de su cuenta y la eliminación de todos sus datos contactando al soporte o desde la configuración de su cuenta.</li>
              <li>Antes de proceder con la baja, se requerirá confirmación de identidad y se informará sobre las consecuencias irreversibles.</li>
              <li>La baja de cuenta implica la cancelación inmediata de la suscripción activa sin reembolso.</li>
              <li>Todos los datos del Usuario, incluyendo ventas, clientes, inventario, configuraciones y archivos, serán eliminados permanentemente en un plazo máximo de 30 días naturales.</li>
              <li>Los datos fiscales (CFDI emitidos) se conservarán por el periodo mínimo requerido por la legislación fiscal mexicana (5 años), incluso después de la baja.</li>
              <li>Los datos de facturación y registros de pago se conservarán conforme a las obligaciones contables y fiscales aplicables.</li>
              <li>La eliminación de datos es irreversible. La Empresa no podrá recuperar información una vez completado el proceso de baja.</li>
              <li>Los usuarios secundarios (empleados) asociados a la empresa también perderán acceso de forma inmediata.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">9. Uso Aceptable</h2>
            <p>El Usuario se compromete a:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Utilizar el Servicio únicamente para fines lícitos y comerciales legítimos.</li>
              <li>No intentar acceder a cuentas, datos o funcionalidades no autorizadas.</li>
              <li>No realizar ingeniería inversa, descompilación o modificación del software.</li>
              <li>No transmitir virus, malware o código malicioso a través del Servicio.</li>
              <li>No utilizar el Servicio para enviar comunicaciones no solicitadas (spam) por WhatsApp u otro medio.</li>
              <li>No sobrecargar intencionalmente los servidores o infraestructura del Servicio.</li>
              <li>Cumplir con todas las leyes y regulaciones aplicables, incluyendo normatividad fiscal del SAT.</li>
              <li>No compartir sus credenciales de acceso con terceros no autorizados.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">10. Propiedad Intelectual</h2>
            <p>Todo el software, diseño, código fuente, logos, marcas y contenido del Servicio son propiedad exclusiva de RutApp y están protegidos por las leyes de propiedad intelectual aplicables. El Usuario retiene la propiedad de sus datos comerciales pero otorga una licencia limitada para que RutApp los procese conforme al Servicio.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">11. Disponibilidad y Soporte</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>La Empresa se esfuerza por mantener un uptime del 99.5%, pero no garantiza disponibilidad ininterrumpida.</li>
              <li>Se realizarán mantenimientos programados con aviso previo cuando sea posible.</li>
              <li>El soporte técnico se ofrece por los canales oficiales (WhatsApp, correo electrónico) durante horarios laborales.</li>
              <li>La Empresa no es responsable por interrupciones causadas por terceros (proveedores de internet, servicios del SAT, pasarelas de pago, etc.).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">12. Limitación de Responsabilidad</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>El Servicio se provee "tal cual" sin garantías expresas o implícitas de comerciabilidad o adecuación.</li>
              <li>La Empresa no será responsable por daños indirectos, incidentales, especiales o consecuentes derivados del uso del Servicio.</li>
              <li>La responsabilidad máxima de la Empresa estará limitada al monto pagado por el Usuario en los últimos 3 meses.</li>
              <li>La Empresa no es responsable por errores en la información fiscal proporcionada por el Usuario.</li>
              <li>El Usuario es responsable de verificar la exactitud de sus facturas, documentos fiscales y reportes generados.</li>
              <li>La Empresa no garantiza resultados comerciales específicos derivados del uso del Servicio.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">13. Suspensión y Terminación por la Empresa</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>La Empresa puede suspender o terminar cuentas que violen estos Términos sin previo aviso.</li>
              <li>La falta de pago por más de 10 días naturales después del vencimiento resultará en la suspensión del servicio.</li>
              <li>Actividades fraudulentas, ilegales o que comprometan la seguridad del sistema resultarán en terminación inmediata.</li>
              <li>En caso de terminación por violación, no se otorgará reembolso alguno.</li>
              <li>La Empresa notificará al Usuario por correo electrónico sobre cualquier acción de suspensión o terminación, salvo en casos de emergencia de seguridad.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">14. Modificaciones a los Términos</h2>
            <p>La Empresa se reserva el derecho de modificar estos Términos en cualquier momento. Los cambios significativos serán notificados con al menos 15 días de anticipación por correo electrónico y/o mediante aviso en la plataforma. El uso continuado del Servicio tras los cambios constituye la aceptación de los Términos modificados. Si el Usuario no acepta los nuevos términos, deberá cancelar su suscripción antes de la fecha de entrada en vigor.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">15. Legislación Aplicable y Jurisdicción</h2>
            <p>Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia será resuelta en los tribunales competentes de la ciudad de Guadalajara, Jalisco, México. Las partes renuncian a cualquier otro fuero que pudiera corresponderles por razón de domicilio presente o futuro.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">16. Contacto</h2>
            <p>Para consultas relacionadas con estos Términos, puede contactarnos a través de los canales de soporte disponibles en la plataforma o enviando un correo electrónico a soporte@rutapp.com.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
