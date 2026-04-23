import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useVehiculos } from '@/hooks/useVehiculos';
import { useAbrirRutaSesion, useRutaSesionActiva } from '@/hooks/useRutaSesion';
import { useEmpresaJornadaConfig } from '@/hooks/useEmpresaJornadaConfig';
import { uploadOdometroFoto } from '@/lib/rutaFotos';
import { locationService } from '@/lib/locationService';
import { ArrowLeft, Truck, Camera, Loader2, MapPin, Play, CheckCircle2, PersonStanding } from 'lucide-react';
import { toast } from 'sonner';

export default function RutaIniciarPage() {
  const nav = useNavigate();
  const { profile, empresa } = useAuth();
  const { config } = useEmpresaJornadaConfig();
  const permiteSinVehiculo = !!config?.jornada_permite_sin_vehiculo;
  const { data: vehiculos = [], isLoading: loadingVehiculos } = useVehiculos({ soloActivos: true, vendedorId: profile?.id });
  const { data: sesionActiva } = useRutaSesionActiva();
  const abrir = useAbrirRutaSesion();

  // Modo: con vehículo o sin vehículo (a pie/moto propia)
  const [sinVehiculo, setSinVehiculo] = useState(false);
  const [vehiculoId, setVehiculoId] = useState<string>('');
  const [kmInicio, setKmInicio] = useState<string>('');
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string>('');
  const [notas, setNotas] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [uploading, setUploading] = useState(false);

  // Pre-select default vehicle for this vendedor
  useEffect(() => {
    if (!vehiculoId && vehiculos.length) {
      const mine = vehiculos.find(v => v.vendedor_default_id === profile?.id);
      setVehiculoId((mine || vehiculos[0]).id);
    }
  }, [vehiculos, vehiculoId, profile?.id]);

  // Pre-fill km with vehicle current km
  useEffect(() => {
    const v = vehiculos.find(x => x.id === vehiculoId);
    if (v && !kmInicio) setKmInicio(String(v.km_actual));
  }, [vehiculoId, vehiculos]);

  // Get GPS once
  useEffect(() => {
    locationService.startWatching();
    const c = locationService.getLastKnownLocation();
    if (c) setCoords(c);
    const off = locationService.onUpdate((loc) => setCoords(loc));
    return off;
  }, []);

  // Already active session → redirect
  useEffect(() => {
    if (sesionActiva) {
      toast.info('Ya tienes una jornada en curso');
      nav('/ruta', { replace: true });
    }
  }, [sesionActiva, nav]);

  const onFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFoto(f);
    setFotoPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    try {
      setUploading(true);
      let fotoUrl: string | null = null;

      if (sinVehiculo) {
        // Sin vehículo: no se exige nada más
        await abrir.mutateAsync({
          vehiculo_id: null,
          km_inicio: null,
          lat_inicio: coords?.lat ?? null,
          lng_inicio: coords?.lng ?? null,
          foto_inicio_url: null,
          notas_inicio: notas || 'Sin vehículo',
        });
      } else {
        if (!vehiculoId) { toast.error('Selecciona un vehículo'); setUploading(false); return; }
        const km = parseFloat(kmInicio);
        if (!Number.isFinite(km) || km < 0) { toast.error('Captura un KM válido'); setUploading(false); return; }
        if (!foto) { toast.error('Toma la foto del odómetro'); setUploading(false); return; }
        fotoUrl = await uploadOdometroFoto(foto, empresa!.id, 'inicio');
        await abrir.mutateAsync({
          vehiculo_id: vehiculoId,
          km_inicio: km,
          lat_inicio: coords?.lat ?? null,
          lng_inicio: coords?.lng ?? null,
          foto_inicio_url: fotoUrl,
          notas_inicio: notas || null,
        });
      }

      toast.success('Jornada iniciada ✓');
      nav('/ruta', { replace: true });
    } catch (e: any) {
      toast.error(e.message || 'Error al iniciar jornada');
    } finally {
      setUploading(false);
    }
  };

  const submitDisabled = uploading || abrir.isPending || (
    sinVehiculo ? false : (!vehiculoId || !foto || !kmInicio)
  );

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 px-3 h-12">
          <button onClick={() => nav('/ruta')} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent">
            <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
          </button>
          <span className="text-[15px] font-semibold text-foreground flex-1 flex items-center gap-2">
            <Play className="h-4 w-4 text-primary" /> Iniciar jornada
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-3 py-3 space-y-3 pb-24">
        {/* Intro */}
        <div className="bg-primary/5 rounded-xl p-3 border border-primary/10">
          <p className="text-[12px] font-semibold text-foreground mb-0.5">Antes de salir a ruta</p>
          <p className="text-[11px] text-muted-foreground">
            {sinVehiculo
              ? 'Registrarás tu jornada sin vehículo. Solo necesitamos confirmar tu ubicación.'
              : 'Selecciona el vehículo, captura el KM inicial y toma una foto del odómetro. Esto registra tu jornada para auditoría.'}
          </p>
        </div>

        {/* Selector de modo (sólo si la empresa lo permite) */}
        {permiteSinVehiculo && (
          <div className="bg-card border border-border rounded-xl p-1 grid grid-cols-2 gap-1">
            <button
              onClick={() => setSinVehiculo(false)}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[12px] font-semibold transition-colors ${
                !sinVehiculo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              <Truck className="h-3.5 w-3.5" /> Con vehículo
            </button>
            <button
              onClick={() => setSinVehiculo(true)}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[12px] font-semibold transition-colors ${
                sinVehiculo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              <PersonStanding className="h-3.5 w-3.5" /> Sin vehículo
            </button>
          </div>
        )}

        {!sinVehiculo && (
          <>
            {/* Vehículo */}
            <div className="bg-card border border-border rounded-xl p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Truck className="h-3 w-3" /> Vehículo
              </p>
              {loadingVehiculos ? (
                <div className="text-[12px] text-muted-foreground">Cargando vehículos...</div>
              ) : vehiculos.length === 0 ? (
                <div className="text-[12px] text-muted-foreground">
                  No hay vehículos registrados. Pide a tu administrador que los dé de alta en <span className="font-semibold">Configuración → Vehículos</span>
                  {permiteSinVehiculo && <> o cambia a <span className="font-semibold">Sin vehículo</span> arriba.</>}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {vehiculos.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setVehiculoId(v.id)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        vehiculoId === v.id ? 'border-primary bg-primary/5' : 'border-border bg-background'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[13px] font-semibold text-foreground">{v.alias}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {[v.placa, v.marca, v.modelo].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground">KM actual</p>
                          <p className="text-[13px] font-bold text-foreground tabular-nums">{Number(v.km_actual).toLocaleString()}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* KM */}
            <div className="bg-card border border-border rounded-xl p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">KM inicial</p>
              <input
                type="number"
                inputMode="decimal"
                value={kmInicio}
                onChange={e => setKmInicio(e.target.value)}
                placeholder="0"
                className="w-full bg-accent/40 rounded-md px-3 py-3 text-[18px] font-bold text-foreground tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Debe ser igual o mayor al KM actual del vehículo.</p>
            </div>

            {/* Foto */}
            <div className="bg-card border border-border rounded-xl p-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                <Camera className="h-3 w-3" /> Foto del odómetro
              </p>
              {fotoPreview ? (
                <div className="relative">
                  <img src={fotoPreview} alt="Odómetro" className="w-full max-h-64 object-cover rounded-lg" />
                  <button
                    onClick={() => { setFoto(null); setFotoPreview(''); }}
                    className="absolute top-2 right-2 bg-background/90 text-foreground text-[11px] font-semibold px-2 py-1 rounded-md"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border rounded-lg py-6 cursor-pointer hover:bg-accent/30 transition-colors">
                  <Camera className="h-6 w-6 text-muted-foreground" />
                  <span className="text-[12px] text-muted-foreground">Tomar foto</span>
                  <input type="file" accept="image/*" capture="environment" onChange={onFotoChange} className="hidden" />
                </label>
              )}
            </div>
          </>
        )}

        {/* GPS */}
        <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-2">
          <MapPin className={`h-4 w-4 ${coords ? 'text-success' : 'text-muted-foreground'}`} />
          <div className="flex-1 text-[12px]">
            {coords ? (
              <span className="text-foreground">Ubicación detectada</span>
            ) : (
              <span className="text-muted-foreground">Esperando ubicación GPS...</span>
            )}
          </div>
          {coords && <CheckCircle2 className="h-4 w-4 text-success" />}
        </div>

        {/* Notas */}
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notas (opcional)</p>
          <textarea
            rows={2}
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder={sinVehiculo ? 'Medio de transporte, observaciones...' : 'Estado del vehículo, observaciones...'}
            className="w-full bg-accent/40 rounded-md px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none"
          />
        </div>
      </div>

      {/* Submit */}
      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent">
        <button
          onClick={submit}
          disabled={submitDisabled}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5"
        >
          {(uploading || abrir.isPending) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {uploading ? 'Subiendo foto...' : abrir.isPending ? 'Iniciando...' : 'Iniciar jornada'}
        </button>
      </div>
    </div>
  );
}
