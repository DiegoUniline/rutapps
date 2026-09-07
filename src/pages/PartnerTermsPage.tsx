import { Link } from 'react-router-dom';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import { Seo } from '@/components/seo/Seo';
import { PARTNER_LEVELS_PUBLIC, PARTNER_TERMS_VERSION } from '@/lib/partnerProgram';

export default function PartnerTermsPage() {
  return (
    <MarketingShell>
      <Seo title="Términos del Programa de Partners · Rutapp" description="Reglas comerciales del Programa de Partners de Rutapp." path="/partners/terminos" />
      <main className="max-w-4xl mx-auto px-6 py-16 space-y-5 text-slate-700 leading-7 [&_h1]:text-4xl [&_h1]:font-black [&_h1]:tracking-tight [&_h1]:text-slate-950 [&_h2]:pt-5 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-950 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:my-1 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:bg-slate-100 [&_th]:p-2 [&_th]:text-left [&_td]:border [&_td]:p-2">
        <Link to="/partners" className="text-sm no-underline">← Volver al Programa de Partners</Link>
        <h1>Términos del Programa de Partners Rutapp</h1>
        <p className="lead">Versión {PARTNER_TERMS_VERSION}</p>

        <p>
          Estos términos regulan una colaboración comercial independiente para recomendar suscripciones de Rutapp. La solicitud no garantiza aceptación y la aprobación no otorga facultades para representar, contratar, cobrar ni asumir obligaciones en nombre de Rutapp.
        </p>

        <h2>1. Naturaleza independiente</h2>
        <p>
          El Partner decide libremente si participa, cuándo y desde dónde promociona el servicio, qué prospectos contacta y los medios lícitos que utiliza. No existe exclusividad, jornada, lugar de trabajo, supervisión operativa, salario fijo ni obligación de cumplir cuotas. El Partner utiliza sus propios recursos, asume sus gastos y puede prestar servicios a terceros.
        </p>
        <p>
          Estos términos no pretenden renunciar derechos irrenunciables ni sustituir la realidad de la relación. Si en la práctica llegara a existir trabajo personal subordinado, se atenderá a la legislación aplicable, independientemente del nombre del acuerdo.
        </p>

        <h2>2. Atribución y pagos elegibles</h2>
        <ul>
          <li>Una empresa queda atribuida cuando se registra mediante el enlace o cupón del Partner, sujeto a revisión de fraude y autoreferidos.</li>
          <li>La comisión sólo se genera sobre facturas de suscripción efectivamente pagadas y no reembolsadas.</li>
          <li>Pruebas gratuitas, facturas fallidas, canceladas, condonadas o reembolsadas no generan comisión.</li>
          <li>La atribución no es transferible y puede anularse cuando exista fraude, identidad falsa, control común no revelado o uso abusivo de cupones.</li>
        </ul>

        <h2>3. Metas, porcentajes y bonos</h2>
        <p>Para la meta cuentan únicamente empresas atribuidas con suscripción activa y acceso no bloqueado. La comisión aplicable se fija al momento de cada cobro.</p>
        <table>
          <thead><tr><th>Nivel</th><th>Empresas activas</th><th>Comisión</th><th>Bono único</th></tr></thead>
          <tbody>{PARTNER_LEVELS_PUBLIC.map(level => <tr key={level.nombre}><td>{level.emoji} {level.nombre}</td><td>{level.max === null ? `${level.min}+` : `${level.min}–${level.max}`}</td><td>{level.pct}%</td><td>{level.bono ? `$${level.bono.toLocaleString('es-MX')} MXN` : '—'}</td></tr>)}</tbody>
        </table>
        <p>
          Los bonos Pro, Elite y Legend se pagan una sola vez por nivel, cuando se alcanza por primera vez. No son mensuales. Si el Partner salta niveles, se generan los bonos de los niveles alcanzados que no hayan sido pagados previamente.
        </p>

        <h2>4. Cupones</h2>
        <p>
          El descuento de un cupón nunca puede superar el porcentaje de comisión vigente. La comisión neta es: <strong>(porcentaje del nivel − porcentaje del cupón) × monto pagado</strong>. Si ambos porcentajes son iguales, la comisión de ese cobro es cero. Un cupón incompatible con un cambio de nivel podrá desactivarse automáticamente.
        </p>

        <h2>5. Pago, impuestos y comprobación</h2>
        <p>
          Los pagos se realizan por transferencia cuando exista por lo menos $500 MXN acumulado, conforme al calendario comunicado; al terminar la participación podrá liquidarse un saldo final menor. El Partner debe proporcionar datos fiscales y bancarios correctos, cumplir sus obligaciones fiscales y entregar el comprobante fiscal que legalmente corresponda. Rutapp aplicará las retenciones que resulten obligatorias según el régimen y tipo de persona del Partner.
        </p>

        <h2>6. Conducta y propiedad intelectual</h2>
        <p>
          El Partner no puede hacer promesas distintas a la información oficial, usar prácticas engañosas, comprar publicidad que suplante la marca, enviar mensajes ilícitos, manipular registros ni presentarse como empleado, agente o representante legal. Las marcas y materiales sólo pueden utilizarse para promocionar Rutapp durante la vigencia del programa.
        </p>

        <h2>7. Vigencia, suspensión y cambios</h2>
        <p>
          Cualquiera de las partes puede terminar su participación mediante aviso. Rutapp puede suspenderla inmediatamente por fraude, riesgo de seguridad o incumplimiento. La terminación no elimina comisiones válidamente generadas antes de la fecha efectiva, salvo movimientos anulados o reembolsados. Los cambios económicos se notificarán con al menos 30 días y se aplicarán prospectivamente.
        </p>

        <h2>8. Expediente y privacidad</h2>
        <p>
          Al aceptar estos términos, el solicitante autoriza expresamente el tratamiento de los datos financieros o patrimoniales que voluntariamente proporcione —incluidos banco y CLABE— exclusivamente para validar y realizar pagos, conciliar movimientos y cumplir obligaciones legales. También se conservarán datos de contacto, atribuciones, cupones, comisiones, pagos y evidencia de aceptación. Consulta el <Link to="/privacidad">Aviso de Privacidad</Link> para conocer derechos y medios de contacto.
        </p>

        <div className="not-prose mt-10 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Este texto establece las reglas operativas del programa. Para partners con volúmenes relevantes o actividades adicionales, Rutapp podrá requerir un contrato comercial firmado y documentación fiscal complementaria.
        </div>
      </main>
    </MarketingShell>
  );
}
