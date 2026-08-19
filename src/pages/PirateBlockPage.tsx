import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

export default function PirateBlockPage() {
  const handleWhatsApp = () => {
    window.location.href = "https://wa.me/91985837992";
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8 text-center space-y-6">
        <div className="flex justify-center">
          <div className="bg-red-50 p-4 rounded-full">
            <AlertCircle className="w-12 h-12 text-red-600" />
          </div>
        </div>
        
        <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
          ESTA EXTENSÃO FOI PIRATEADA
        </h1>
        
        <div className="space-y-4">
          <p className="text-slate-600 leading-relaxed text-sm">
            A chave utilizada nesta extensão foi bloqueada por uso não autorizado. 
            Fale com o contato oficial abaixo para adquirir a versão original.
          </p>
          <p className="font-bold text-slate-900 text-sm">
            FALAR COM O CONTATO OFICIAL (91) 98583-7992 ou no botão abaixo
          </p>
        </div>

        <Button 
          onClick={handleWhatsApp}
          className="w-full h-14 bg-green-600 hover:bg-green-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-green-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          CHAMAR NO WHATSAPP
        </Button>
      </div>
    </div>
  );
}
