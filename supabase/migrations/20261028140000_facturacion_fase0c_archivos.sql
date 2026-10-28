-- Facturación · Fase 0-C (D-013, S-12): XML/PDF de CFDI en bucket PRIVADO.
-- Sin políticas en storage.objects para este bucket: solo la función facturama
-- (service_role) escribe y firma enlaces temporales. Los archivos ya existentes
-- en el bucket público empresa-assets NO se mueven aquí (se migran aparte).
INSERT INTO storage.buckets (id, name, public)
VALUES ('cfdi-archivos', 'cfdi-archivos', false)
ON CONFLICT (id) DO UPDATE SET public = false;
