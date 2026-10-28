import forge from "npm:node-forge@1.3.1";

/**
 * Lee y valida el CSD antes de mandarlo a Facturama: el .key abre con la
 * contraseña, corresponde al .cer, el .cer es del RFC de la empresa y está vigente.
 * (node:crypto de Deno no abre el PKCS#8 cifrado del SAT; node-forge sí.)
 */
export function validarCsd(rfc: string, certificateB64: string, keyB64: string, password: string) {
  let cert: any;
  try {
    cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.decode64(certificateB64)));
  } catch {
    throw new Error("El archivo .cer no es un certificado válido.");
  }
  const noCertificado = (String(cert.serialNumber).match(/.{2}/g) ?? [])
    .map((h: string) => String.fromCharCode(parseInt(h, 16))).join("");
  if (!/^\d{20}$/.test(noCertificado)) throw new Error("El .cer no parece un CSD del SAT (número de certificado inválido).");
  const sujeto = cert.subject.attributes.map((a: any) => String(a.value ?? "")).join(" ").toUpperCase();
  if (!sujeto.includes(rfc)) throw new Error(`El certificado no pertenece al RFC ${rfc}.`);
  const vence: Date = cert.validity.notAfter;
  if (vence.getTime() < Date.now()) throw new Error(`El certificado venció el ${vence.toISOString().slice(0, 10)}.`);
  let llave: any = null;
  try {
    const info = forge.pki.decryptPrivateKeyInfo(forge.asn1.fromDer(forge.util.decode64(keyB64)), password);
    if (info) llave = forge.pki.privateKeyFromAsn1(info);
  } catch { /* llave ilegible → mismo mensaje */ }
  if (!llave) throw new Error("La contraseña de la llave privada (.key) es incorrecta o el archivo no es válido.");
  const pub = cert.publicKey as any;
  if (!pub?.n?.equals(llave.n) || !pub?.e?.equals(llave.e)) throw new Error("La llave privada (.key) no corresponde al certificado (.cer).");
  return { noCertificado, vence };
}
