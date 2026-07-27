import React from "react";
import { useNotifications } from "@/contexts/NotificationContext";
import { NotificationBanner } from "@/components/NotificationBanner";

export function InAppNotificationBanner() {
  const { inAppNotification, dismissInAppNotification } = useNotifications();

  return (
    <NotificationBanner
      notification={inAppNotification}
      onDismiss={dismissInAppNotification}
    />
  );
}
