import { useBroadcastMessages } from '@/hooks/useBroadcastMessages';

/**
 * Mount once near the app root for authenticated users. Subscribes to
 * `broadcast_messages` realtime INSERTs and shows a toast for each new
 * message globally — no UI of its own.
 */
export default function BroadcastListener() {
  useBroadcastMessages();
  return null;
}
