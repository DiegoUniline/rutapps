import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import AjustesInventarioPage from './AjustesInventarioPage';
import MermasPage from './MermasPage';

export default function AjustesMermasPage() {
  const [tab, setTab] = useState<'ajustes' | 'mermas'>('ajustes');
  return (
    <div className="p-4 lg:p-6 bg-background min-h-[100dvh]">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'ajustes' | 'mermas')}>
        <TabsList>
          <TabsTrigger value="ajustes">Ajustes</TabsTrigger>
          <TabsTrigger value="mermas">Mermas</TabsTrigger>
        </TabsList>
        <TabsContent value="ajustes" className="mt-4">
          <AjustesInventarioPage />
        </TabsContent>
        <TabsContent value="mermas" className="mt-4">
          <MermasPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
