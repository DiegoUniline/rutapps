import { useActiveNotifications, useNotificationViews } from '@/hooks/useNotifications';
import NotificationBanners from './NotificationBanners';
import NotificationModal from './NotificationModal';
import NotificationBubble from './NotificationBubble';

interface Props {
  /** Render only banners (placed above navbar) */
  bannersOnly?: boolean;
  /** Render modal + bubble (placed at layout level) */
  overlaysOnly?: boolean;
}

export default function NotificationRuntime({ bannersOnly, overlaysOnly }: Props) {
  const { data: notifications = [] } = useActiveNotifications();
  const { data: views = [] } = useNotificationViews();

  if (notifications.length === 0) return null;

  if (bannersOnly) {
    return <NotificationBanners notifications={notifications} />;
  }

  if (overlaysOnly) {
    return (
      <>
        <NotificationModal notifications={notifications} views={views} />
        <NotificationBubble notifications={notifications} />
      </>
    );
  }

  return (
    <>
      <NotificationBanners notifications={notifications} />
      <NotificationModal notifications={notifications} views={views} />
      <NotificationBubble notifications={notifications} />
    </>
  );
}
