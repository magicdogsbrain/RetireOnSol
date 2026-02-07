import { useEffect, useState } from 'react';
import { notificationService } from '../services/notificationService';
import { Capacitor } from '@capacitor/core';

export function useNotifications() {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const init = async () => {
      const available = await notificationService.initialize();
      setIsAvailable(available);
      setIsInitialized(true);

      // Start background price monitor and tip reminder if notifications are available
      if (available) {
        notificationService.startPriceMonitor();
        notificationService.scheduleTipReminder();
      }
    };

    // Only initialize on native platforms
    if (Capacitor.isNativePlatform()) {
      init();
    } else {
      setIsInitialized(true);
      setIsAvailable(false);
    }

    return () => {
      notificationService.stopPriceMonitor();
    };
  }, []);

  return {
    isAvailable,
    isInitialized,
    isNative: Capacitor.isNativePlatform(),
    scheduleDCAReminder: notificationService.scheduleDCAReminder.bind(notificationService),
    scheduleMissedDCAReminder: notificationService.scheduleMissedDCAReminder.bind(notificationService),
    cancelNotification: notificationService.cancelNotification.bind(notificationService),
    cancelAllNotifications: notificationService.cancelAllNotifications.bind(notificationService),
    getPendingNotifications: notificationService.getPendingNotifications.bind(notificationService),
    sendTestNotification: notificationService.sendTestNotification.bind(notificationService),
  };
}
