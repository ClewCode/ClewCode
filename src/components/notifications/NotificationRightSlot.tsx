import type { ReactNode } from 'react';
import { useAppState } from 'src/state/AppState.js';
import { Text } from '../../ink.js';
import { shouldShowNotificationOnRight } from './notificationPlacement.js';

/**
 * Renders the current notification when it belongs on the right-hand side of
 * the prompt footer (see RIGHT_ALIGNED_NOTIFICATION_KEYS) — today, the effort
 * indicator.
 *
 * It reads the same `notifications.current` slot the left column reads rather
 * than owning its own state, so priority ordering and the auto-dismiss timeout
 * keep working exactly as before; only the render location changes.
 */
export function NotificationRightSlot(): ReactNode {
  const current = useAppState(s => s.notifications.current);
  if (!current || !shouldShowNotificationOnRight(current)) {
    return null;
  }
  if ('jsx' in current) {
    return <Text wrap="truncate">{current.jsx}</Text>;
  }
  return (
    <Text color={current.color} dimColor={!current.color} wrap="truncate">
      {current.text}
    </Text>
  );
}
