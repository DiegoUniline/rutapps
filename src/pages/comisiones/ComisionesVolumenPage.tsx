import { useNavigate } from 'react-router-dom';
import ComisionesVolumenTab from '@/components/comisiones/ComisionesVolumenTab';
export default function ComisionesVolumenPage() {
  const navigate = useNavigate();
  return <ComisionesVolumenTab onAfterGenerar={() => navigate('/comisiones/recibos')} />;
}
