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
            <p>Al acceder y utilizar la plataforma RutApp ("el Servicio"), usted acepta estos Términos y Condiciones en su totalidad. Si no está de acuerdo con alguna parte, no debe utilizar el Servicio. Estos términos constituyen un acuerdo legalmente vinculante entre usted ("el Usuario") y RutApp ("la Empresa").</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">2. Descripción del Servicio</h2>
            <p>RutApp es una plataforma de gestión empresarial en la nube (SaaS) que incluye, entre otras funcionalidades: gestión de ventas, inventario, facturación electrónica CFDI 4.0, logística de entregas, control de rutas, cobranza, reportes y comunicación por WhatsApp. El Servicio se ofrece "tal cual" y puede ser actualizado, modificado o discontinuado en cualquier momento.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">3. Registro y Cuenta</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>El Usuario debe proporcionar información veraz, completa y actualizada durante el registro.</li>
              <li>Cada cuenta es personal e intransferible. El Usuario es responsable de mantener la confidencialidad de sus credenciales.</li>
              <li>El Usuario debe ser mayor de 18 años o tener capacidad legal para contratar.</li>
              <li>La verificación de identidad mediante código por WhatsApp es obligatoria para completar el registro.</li>
              <li>El Usuario es responsable de todas las actividades realizadas bajo su cuenta.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">4. Planes, Pagos y Suscripciones</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>El Servicio incluye un periodo de prueba gratuito de 7 días naturales.</li>
              <li>Al finalizar el periodo de prueba, se otorgan 3 días de gracia adicionales antes de suspender el acceso.</li>
              <li>Los pagos se procesan de forma segura mediante Stripe. La Empresa no almacena datos de tarjetas.</li>
              <li>Las suscripciones se renuevan automáticamente de forma mensual salvo cancelación previa.</li>
              <li>Los timbres fiscales (créditos de facturación) son no reembolsables una vez adquiridos.</li>
              <li>La Empresa se reserva el derecho de modificar los precios con aviso previo de 30 días.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">5. Uso Aceptable</h2>
            <p>El Usuario se compromete a:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Utilizar el Servicio únicamente para fines lícitos y comerciales legítimos.</li>
              <li>No intentar acceder a cuentas, datos o funcionalidades no autorizadas.</li>
              <li>No realizar ingeniería inversa, descompilación o modificación del software.</li>
              <li>No transmitir virus, malware o código malicioso a través del Servicio.</li>
              <li>No utilizar el Servicio para enviar comunicaciones no solicitadas (spam).</li>
              <li>No sobrecargar intencionalmente los servidores o infraestructura del Servicio.</li>
              <li>Cumplir con todas las leyes y regulaciones aplicables, incluyendo normatividad fiscal del SAT.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">6. Propiedad Intelectual</h2>
            <p>Todo el software, diseño, código fuente, logos, marcas y contenido del Servicio son propiedad exclusiva de RutApp y están protegidos por las leyes de propiedad intelectual aplicables. El Usuario retiene la propiedad de sus datos comerciales pero otorga una licencia limitada para que RutApp los procese conforme al Servicio.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">7. Disponibilidad y Soporte</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>La Empresa se esfuerza por mantener un uptime del 99.5%, pero no garantiza disponibilidad ininterrumpida.</li>
              <li>Se realizarán mantenimientos programados con aviso previo cuando sea posible.</li>
              <li>El soporte técnico se ofrece por los canales oficiales durante horarios laborales.</li>
              <li>La Empresa no es responsable por interrupciones causadas por terceros (proveedores de internet, servicios del SAT, etc.).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">8. Limitación de Responsabilidad</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>El Servicio se provee "tal cual" sin garantías expresas o implícitas de comerciabilidad o adecuación.</li>
              <li>La Empresa no será responsable por daños indirectos, incidentales, especiales o consecuentes.</li>
              <li>La responsabilidad máxima de la Empresa estará limitada al monto pagado por el Usuario en los últimos 3 meses.</li>
              <li>La Empresa no es responsable por errores en la información fiscal proporcionada por el Usuario.</li>
              <li>El Usuario es responsable de verificar la exactitud de sus facturas y documentos fiscales.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">9. Suspensión y Terminación</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>La Empresa puede suspender o terminar cuentas que violen estos Términos sin previo aviso.</li>
              <li>El Usuario puede cancelar su suscripción en cualquier momento desde su panel de control.</li>
              <li>Al cancelar, el acceso se mantiene hasta el final del periodo de facturación actual.</li>
              <li>Tras la terminación, los datos del Usuario serán retenidos por 30 días y luego eliminados permanentemente.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">10. Modificaciones</h2>
            <p>La Empresa se reserva el derecho de modificar estos Términos en cualquier momento. Los cambios significativos serán notificados con al menos 15 días de anticipación. El uso continuado del Servicio tras los cambios constituye la aceptación de los Términos modificados.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">11. Legislación Aplicable</h2>
            <p>Estos Términos se rigen por las leyes de los Estados Unidos Mexicanos. Cualquier controversia será resuelta en los tribunales competentes de la ciudad de Guadalajara, Jalisco, México.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-foreground">12. Contacto</h2>
            <p>Para consultas relacionadas con estos Términos, puede contactarnos a través de los canales de soporte disponibles en la plataforma.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
