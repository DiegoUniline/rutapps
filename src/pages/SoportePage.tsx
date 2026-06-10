import { useEffect, useMemo } from "react";
import { MessageCircle, Clock, Bot, Mail, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SoporteChatPanel from "@/components/soporte/SoporteChatPanel";

const WHATSAPP_NUMBER = "5213171045954";
const WHATSAPP_DISPLAY = "+52 1 317 104 5954";
const SUPPORT_EMAIL = "soporte@rutapp.mx";

const HORARIO = {
  diasLabel: "Lunes a Viernes",
  desdeHora: 9,
  hastaHora: 16,
  zona: "America/Mexico_City",
};

function useDentroHorario() {
  return useMemo(() => {
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: HORARIO.zona,
        weekday: "short",
        hour: "2-digit",
        hour12: false,
      });
      const parts = fmt.formatToParts(new Date());
      const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
      const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
      const esDiaHabil = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
      const enRango = hour >= HORARIO.desdeHora && hour < HORARIO.hastaHora;
      return esDiaHabil && enRango;
    } catch {
      return false;
    }
  }, []);
}

export default function SoportePage() {
  const dentro = useDentroHorario();

  useEffect(() => {
    document.title = "Soporte | RutApp";
  }, []);

  const waMsg = encodeURIComponent("Hola equipo RutApp, necesito ayuda con mi cuenta.");
  const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${waMsg}`;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Soporte</h1>
        <p className="text-sm text-muted-foreground">
          Estamos para ayudarte. Contáctanos por WhatsApp en horario de oficina o usa el asesor IA 24/7.
        </p>
      </header>

      <Tabs defaultValue="ia" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ia" className="gap-1.5">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Asesor</span> IA
          </TabsTrigger>
          <TabsTrigger value="whatsapp" className="gap-1.5">
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1.5">
            <Mail className="h-4 w-4" />
            Correo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ia" className="mt-4">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Bot className="h-5 w-5" />
                </span>
                Asesor IA — 24/7
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Experto en todos los módulos: ventas, cobranza, inventario, rutas, facturación y más.
              </p>
            </CardHeader>
            <CardContent>
              <SoporteChatPanel />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp" className="mt-4 space-y-4">
          <Card className="border-2 border-[#25D366]/30 shadow-sm">
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366] text-white">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  WhatsApp
                </CardTitle>
                {dentro ? (
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                    <CheckCircle2 className="mr-1 h-3 w-3" /> En línea
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                    <AlertCircle className="mr-1 h-3 w-3" /> Fuera de horario
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Atención humana directa con nuestro equipo.
              </p>
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p className="font-medium">{WHATSAPP_DISPLAY}</p>
              </div>
              <Button asChild className="w-full bg-[#25D366] text-white hover:bg-[#1ebe57]" size="lg">
                <a href={waUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-5 w-5" />
                  Abrir WhatsApp
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5 text-primary" />
                Horario de atención
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-sm text-muted-foreground">Equipo humano</p>
                <p className="mt-1 text-lg font-semibold">{HORARIO.diasLabel}</p>
                <p className="text-2xl font-bold text-primary">09:00 – 16:00 hrs</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Zona horaria: Ciudad de México (CST)
                </p>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                  <div
                    key={i}
                    className={`rounded-md py-2 font-medium ${
                      i < 5 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {d}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Mail className="h-5 w-5 text-primary" />
                Correo electrónico
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Para temas administrativos o facturación:
              </p>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="mt-1 inline-block font-semibold text-primary hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
