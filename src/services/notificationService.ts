import { LocalNotifications } from '@capacitor/local-notifications';
import type { ScheduleOptions } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { loadActivePlan } from '../utils/storage';
import { calculateDCASchedule } from '../utils/dcaSchedule';

export interface DCANotification {
  id: number;
  title: string;
  body: string;
  scheduledAt: Date;
}

// ─── Price monitor storage keys ──────────────────────────────────────────
const PRICE_BASELINE_KEY = 'retireonsol_price_baseline';
const PRICE_ALERT_COOLDOWN_KEY = 'retireonsol_price_alert_cooldown';
const PRICE_ALERT_THRESHOLD = 0.05; // 5%
const PRICE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const PRICE_ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 4 hours between alerts
const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';

// ─── Tip reminder ──────────────────────────────────────────────────────
const TIP_REMINDER_SCHEDULED_KEY = 'retireonsol_tip_reminder_scheduled';
const TIP_REMINDER_ID = 888888;
const TIP_REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TIP_REMINDER_MIN_RESCHEDULE_MS = 6 * 24 * 60 * 60 * 1000; // 6 days

const TIP_MESSAGES = [
  { title: 'Enjoying RetireOnSol?', body: "Your plan is on track! If the app's helping, buy the dev a coffee — donate in the footer." },
  { title: 'Your SOL plan is working hard', body: "Built by an indie dev, not AI — Claude Code isn't getting a cent! Tip in the footer." },
  { title: 'Still stacking SOL?', body: 'If RetireOnSol is part of your routine, the dev would love a coffee. Donate in the footer!' },
  { title: 'Keep building that future!', body: "RetireOnSol is free and ad-free. Claude Code built it but the dev pays the bills — tip in the footer!" },
];

function getEncouragingMessage(progressPct: number): string {
  if (progressPct < 5) return "Every journey starts with a single step!";
  if (progressPct < 15) return "You're building a great habit!";
  if (progressPct < 30) return "Momentum is building! Keep stacking!";
  if (progressPct < 50) return "Almost halfway there — incredible discipline!";
  if (progressPct < 75) return "Past the halfway mark — the future looks bright!";
  if (progressPct < 90) return "The finish line is in sight! You're crushing it!";
  return "Nearly there — what an achievement!";
}

function buildRichBody(amount: number, frequency: string): string {
  const plan = loadActivePlan();
  if (!plan) {
    return `Time to buy $${amount} of SOL (${frequency})`;
  }

  const { settings, activatedAt } = plan;
  const schedule = calculateDCASchedule(activatedAt, settings.dcaFrequency, settings.dcaAmountUSD);

  let dcasPerYear = 12;
  if (settings.dcaFrequency === 'daily') dcasPerYear = 365;
  else if (settings.dcaFrequency === 'weekly') dcasPerYear = 52;
  else if (settings.dcaFrequency === 'yearly') dcasPerYear = 1;

  const totalPlanDCAs = dcasPerYear * settings.years;
  const totalInvested = schedule.totalDueCount * settings.dcaAmountUSD;
  const progressPct = totalPlanDCAs > 0 ? Math.min(Math.round((schedule.totalDueCount / totalPlanDCAs) * 100), 100) : 0;
  const encouragement = getEncouragingMessage(progressPct);

  const lines = [
    `Buy $${amount} SOL (${frequency})`,
    `DCA'd $${totalInvested.toLocaleString()} so far · ${progressPct}% of ${settings.years}yr plan`,
    encouragement,
  ];

  return lines.join('\n');
}

// ─── Price baseline management ───────────────────────────────────────────

interface PriceBaseline {
  price: number;
  timestamp: number;
}

function getPriceBaseline(): PriceBaseline | null {
  try {
    const raw = localStorage.getItem(PRICE_BASELINE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function setPriceBaseline(price: number): void {
  try {
    localStorage.setItem(PRICE_BASELINE_KEY, JSON.stringify({
      price,
      timestamp: Date.now(),
    }));
  } catch { /* ignore */ }
}

function isAlertOnCooldown(): boolean {
  try {
    const raw = localStorage.getItem(PRICE_ALERT_COOLDOWN_KEY);
    if (raw) {
      const ts = JSON.parse(raw);
      return Date.now() - ts < PRICE_ALERT_COOLDOWN_MS;
    }
  } catch { /* ignore */ }
  return false;
}

function setAlertCooldown(): void {
  try {
    localStorage.setItem(PRICE_ALERT_COOLDOWN_KEY, JSON.stringify(Date.now()));
  } catch { /* ignore */ }
}

class NotificationService {
  private isAvailable = false;
  private isNative = false;
  private webNotificationQueue: Map<number, ReturnType<typeof setTimeout>> = new Map();
  private priceMonitorInterval: ReturnType<typeof setInterval> | null = null;

  async initialize() {
    this.isNative = Capacitor.isNativePlatform();

    if (this.isNative) {
      try {
        const permission = await LocalNotifications.requestPermissions();
        this.isAvailable = permission.display === 'granted';

        if (this.isAvailable) {
          console.log('Native notification permissions granted');

          // Create notification channels
          try {
            await LocalNotifications.createChannel({
              id: 'dca_reminders',
              name: 'DCA Reminders',
              description: 'Reminders for scheduled DCA purchases',
              importance: 4,
              sound: 'default',
              vibration: true,
              lights: true,
              lightColor: '#9945FF',
            });
            await LocalNotifications.createChannel({
              id: 'dca_missed',
              name: 'Missed DCA Alerts',
              description: 'Alerts for overdue DCA payments',
              importance: 5,
              sound: 'default',
              vibration: true,
              lights: true,
              lightColor: '#FF6B6B',
            });
            await LocalNotifications.createChannel({
              id: 'price_alerts',
              name: 'SOL Price Alerts',
              description: 'Alerts when SOL price moves more than 5%',
              importance: 4,
              sound: 'default',
              vibration: true,
              lights: true,
              lightColor: '#14F195',
            });
            await LocalNotifications.createChannel({
              id: 'tip_reminders',
              name: 'Support the Dev',
              description: 'Occasional reminders to tip the developer',
              importance: 3,
              sound: 'default',
              vibration: false,
              lights: true,
              lightColor: '#14F195',
            });
            console.log('Notification channels created');
          } catch (channelError) {
            console.error('Error creating notification channels:', channelError);
          }

          // Listen for notification taps — route to relevant UI
          LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
            const extra = notification.notification.extra;
            console.log('[Notification] Tapped:', extra);
            if (extra?.type === 'tip-reminder') {
              // Set flag so TipFooter auto-opens the confirm dialog
              try { localStorage.setItem('retireonsol_tip_open', '1'); } catch { /* ignore */ }
            }
          });
        } else {
          console.log('Native notification permissions denied');
        }

        return this.isAvailable;
      } catch (error) {
        console.error('Error initializing native notifications:', error);
        return false;
      }
    } else {
      // Web platform: use browser Notification API
      if (!('Notification' in window)) {
        console.log('Browser does not support notifications');
        return false;
      }

      if (Notification.permission === 'granted') {
        this.isAvailable = true;
        console.log('Web notification permissions already granted');
        return true;
      } else if (Notification.permission !== 'denied') {
        try {
          const permission = await Notification.requestPermission();
          this.isAvailable = permission === 'granted';
          console.log(`Web notification permission: ${permission}`);
          return this.isAvailable;
        } catch (error) {
          console.error('Error requesting web notification permission:', error);
          return false;
        }
      } else {
        console.log('Web notification permissions denied');
        return false;
      }
    }
  }

  async scheduleDCAReminder(
    dcaDate: Date,
    amount: number,
    frequency: string
  ): Promise<number | null> {
    if (!this.isAvailable) {
      console.log('Notifications not available');
      return null;
    }

    const id = Math.floor(Math.random() * 1000000);
    const title = 'DCA Reminder';
    const body = buildRichBody(amount, frequency);

    try {
      if (this.isNative) {
        const schedule: ScheduleOptions = {
          notifications: [
            {
              id,
              title,
              body,
              schedule: { at: dcaDate },
              sound: 'default',
              smallIcon: 'ic_notification',
              channelId: 'dca_reminders',
              autoCancel: false,
              actionTypeId: 'DCA_ACTION',
              extra: { type: 'dca', amount, frequency, scheduledFor: dcaDate.toISOString() },
            },
          ],
        };

        await LocalNotifications.schedule(schedule);
        console.log(`Scheduled native DCA notification ${id} for ${dcaDate}`);
      } else {
        const delay = dcaDate.getTime() - Date.now();
        if (delay > 0) {
          const timeout = setTimeout(() => {
            new Notification(title, { body, icon: 'icons/icon-192.png' });
            this.webNotificationQueue.delete(id);
          }, delay);
          this.webNotificationQueue.set(id, timeout);
          console.log(`Scheduled web DCA notification ${id} for ${dcaDate}`);
        } else {
          console.log('Cannot schedule notification in the past');
          return null;
        }
      }

      return id;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      return null;
    }
  }

  async scheduleMissedDCAReminder(
    amount: number,
    daysMissed: number
  ): Promise<number | null> {
    if (!this.isAvailable) return null;

    const id = Math.floor(Math.random() * 1000000);
    const title = "DCA Time — Don't fall behind!";
    const body = buildRichBody(amount, `${daysMissed} day${daysMissed !== 1 ? 's' : ''} overdue`);

    try {
      if (this.isNative) {
        const schedule: ScheduleOptions = {
          notifications: [
            {
              id,
              title,
              body,
              schedule: { at: new Date(Date.now() + 1000) },
              sound: 'default',
              smallIcon: 'ic_notification',
              channelId: 'dca_missed',
              autoCancel: false,
              actionTypeId: 'MISSED_DCA_ACTION',
              extra: { type: 'missed-dca', amount, daysMissed },
            },
          ],
        };

        await LocalNotifications.schedule(schedule);
        console.log(`Scheduled native missed DCA notification ${id}`);
      } else {
        new Notification(title, { body, icon: 'icons/icon-192.png' });
        console.log(`Showed web missed DCA notification ${id}`);
      }

      return id;
    } catch (error) {
      console.error('Error scheduling missed DCA notification:', error);
      return null;
    }
  }

  // ─── Price alert notification ────────────────────────────────────────────

  private async sendPriceAlert(
    currentPrice: number,
    baselinePrice: number,
    changePct: number,
  ): Promise<void> {
    if (!this.isAvailable) return;

    const id = Math.floor(Math.random() * 1000000);
    const isUp = changePct > 0;
    const direction = isUp ? 'up' : 'down';
    const arrow = isUp ? '↑' : '↓';
    const absPct = Math.abs(changePct * 100).toFixed(1);
    const title = `SOL ${arrow} ${absPct}% — $${currentPrice.toFixed(2)}`;

    const plan = loadActivePlan();
    let body: string;
    if (isUp) {
      body = plan
        ? `SOL is ${direction} from $${baselinePrice.toFixed(2)}. Your holdings are worth more! Check your progress.`
        : `SOL moved ${direction} ${absPct}% to $${currentPrice.toFixed(2)}.`;
    } else {
      body = plan
        ? `SOL dipped to $${currentPrice.toFixed(2)} — good time to DCA? Open the app to swap.`
        : `SOL is down ${absPct}% to $${currentPrice.toFixed(2)}. Time to buy the dip?`;
    }

    try {
      if (this.isNative) {
        const schedule: ScheduleOptions = {
          notifications: [
            {
              id,
              title,
              body,
              schedule: { at: new Date(Date.now() + 500) },
              sound: 'default',
              smallIcon: 'ic_notification',
              channelId: 'price_alerts',
              autoCancel: true,
              extra: { type: 'price-alert', price: currentPrice, changePct },
            },
          ],
        };
        await LocalNotifications.schedule(schedule);
        console.log(`[Price Alert] Sent: ${title}`);
      } else {
        new Notification(title, { body, icon: 'icons/icon-192.png' });
        console.log(`[Price Alert] Web: ${title}`);
      }

      setAlertCooldown();
    } catch (error) {
      console.error('[Price Alert] Error sending:', error);
    }
  }

  // ─── Price monitor ───────────────────────────────────────────────────────

  startPriceMonitor(): void {
    if (this.priceMonitorInterval) return; // already running

    console.log('[Price Monitor] Starting (5min interval, 5% threshold)');

    // Set initial baseline from cached price if we don't have one
    if (!getPriceBaseline()) {
      this.fetchCurrentPrice().then(price => {
        if (price) {
          setPriceBaseline(price);
          console.log(`[Price Monitor] Initial baseline: $${price.toFixed(2)}`);
        }
      });
    }

    this.priceMonitorInterval = setInterval(() => {
      this.checkPriceMovement();
    }, PRICE_CHECK_INTERVAL_MS);
  }

  stopPriceMonitor(): void {
    if (this.priceMonitorInterval) {
      clearInterval(this.priceMonitorInterval);
      this.priceMonitorInterval = null;
      console.log('[Price Monitor] Stopped');
    }
  }

  private async fetchCurrentPrice(): Promise<number | null> {
    try {
      const response = await fetch(`${COINGECKO_API}?ids=solana&vs_currencies=usd`);
      if (!response.ok) return null;
      const data = await response.json();
      return data.solana.usd;
    } catch {
      return null;
    }
  }

  private async checkPriceMovement(): Promise<void> {
    const baseline = getPriceBaseline();
    const currentPrice = await this.fetchCurrentPrice();
    if (!currentPrice) return;

    if (!baseline) {
      // First check — set baseline and return
      setPriceBaseline(currentPrice);
      return;
    }

    const changePct = (currentPrice - baseline.price) / baseline.price;

    // Reset baseline every 24 hours regardless
    const baselineAge = Date.now() - baseline.timestamp;
    if (baselineAge > 24 * 60 * 60 * 1000) {
      setPriceBaseline(currentPrice);
      console.log(`[Price Monitor] Baseline reset (24h): $${currentPrice.toFixed(2)}`);
    }

    if (Math.abs(changePct) >= PRICE_ALERT_THRESHOLD) {
      if (!isAlertOnCooldown()) {
        console.log(`[Price Monitor] ${(changePct * 100).toFixed(1)}% move detected!`);
        await this.sendPriceAlert(currentPrice, baseline.price, changePct);
        // Update baseline after alert so we track from the new level
        setPriceBaseline(currentPrice);
      } else {
        console.log(`[Price Monitor] ${(changePct * 100).toFixed(1)}% move but on cooldown`);
      }
    }
  }

  // ─── Tip reminder ────────────────────────────────────────────────────────

  async scheduleTipReminder(): Promise<void> {
    if (!this.isAvailable) return;

    // Only for users with an active plan
    const plan = loadActivePlan();
    if (!plan) return;

    // Check if we already scheduled recently
    try {
      const lastScheduled = localStorage.getItem(TIP_REMINDER_SCHEDULED_KEY);
      if (lastScheduled) {
        const elapsed = Date.now() - Number(lastScheduled);
        if (elapsed < TIP_REMINDER_MIN_RESCHEDULE_MS) {
          console.log('[Tip Reminder] Already scheduled recently, skipping');
          return;
        }
      }
    } catch { /* ignore */ }

    // Pick a message based on the week number so it rotates
    const weekIndex = Math.floor(Date.now() / TIP_REMINDER_INTERVAL_MS);
    const msg = TIP_MESSAGES[weekIndex % TIP_MESSAGES.length];

    const scheduleAt = new Date(Date.now() + TIP_REMINDER_INTERVAL_MS);

    try {
      // Cancel any existing tip reminder first
      await this.cancelTipReminder();

      if (this.isNative) {
        await LocalNotifications.schedule({
          notifications: [{
            id: TIP_REMINDER_ID,
            title: msg.title,
            body: msg.body,
            schedule: { at: scheduleAt },
            smallIcon: 'ic_notification',
            channelId: 'tip_reminders',
            autoCancel: true,
            extra: { type: 'tip-reminder' },
          }],
        });
      } else {
        const delay = TIP_REMINDER_INTERVAL_MS;
        const timeout = setTimeout(() => {
          new Notification(msg.title, { body: msg.body, icon: 'icons/icon-192.png' });
          this.webNotificationQueue.delete(TIP_REMINDER_ID);
        }, delay);
        this.webNotificationQueue.set(TIP_REMINDER_ID, timeout);
      }

      localStorage.setItem(TIP_REMINDER_SCHEDULED_KEY, String(Date.now()));
      console.log(`[Tip Reminder] Scheduled for ${scheduleAt.toISOString()}`);
    } catch (error) {
      console.error('[Tip Reminder] Error scheduling:', error);
    }
  }

  async sendCustomNotification(title: string, body: string, channelId?: string, type?: string): Promise<void> {
    if (!this.isAvailable) return;

    const id = Math.floor(Math.random() * 1000000);
    try {
      if (this.isNative) {
        await LocalNotifications.schedule({
          notifications: [{
            id,
            title,
            body,
            schedule: { at: new Date(Date.now() + 1000) },
            sound: 'default',
            smallIcon: 'ic_notification',
            channelId: channelId || 'dca_reminders',
            autoCancel: true,
            extra: { type: type || 'custom' },
          }],
        });
      } else {
        new Notification(title, { body, icon: 'icons/icon-192.png' });
      }
    } catch (error) {
      console.error('[Custom Notification] Error:', error);
    }
  }

  async cancelTipReminder(): Promise<void> {
    try {
      if (this.isNative) {
        await LocalNotifications.cancel({ notifications: [{ id: TIP_REMINDER_ID }] });
      } else {
        const timeout = this.webNotificationQueue.get(TIP_REMINDER_ID);
        if (timeout) {
          clearTimeout(timeout);
          this.webNotificationQueue.delete(TIP_REMINDER_ID);
        }
      }
    } catch { /* ignore */ }
  }

  // ─── Standard notification management ──────────────────────────────────

  async cancelNotification(id: number) {
    if (!this.isAvailable) return;

    try {
      if (this.isNative) {
        await LocalNotifications.cancel({ notifications: [{ id }] });
        console.log(`Cancelled native notification ${id}`);
      } else {
        const timeout = this.webNotificationQueue.get(id);
        if (timeout) {
          clearTimeout(timeout);
          this.webNotificationQueue.delete(id);
          console.log(`Cancelled web notification ${id}`);
        }
      }
    } catch (error) {
      console.error('Error cancelling notification:', error);
    }
  }

  async cancelAllNotifications() {
    if (!this.isAvailable) return;

    try {
      if (this.isNative) {
        await LocalNotifications.cancel({ notifications: [] });
        console.log('Cancelled all native notifications');
      } else {
        this.webNotificationQueue.forEach((timeout) => clearTimeout(timeout));
        this.webNotificationQueue.clear();
        console.log('Cancelled all web notifications');
      }
    } catch (error) {
      console.error('Error cancelling all notifications:', error);
    }
  }

  async getPendingNotifications() {
    if (!this.isAvailable) return [];

    try {
      if (this.isNative) {
        const pending = await LocalNotifications.getPending();
        return pending.notifications;
      } else {
        return Array.from(this.webNotificationQueue.keys()).map(id => ({
          id,
          title: 'Scheduled notification',
          body: '',
        }));
      }
    } catch (error) {
      console.error('Error getting pending notifications:', error);
      return [];
    }
  }

  async sendTestNotification() {
    if (!this.isAvailable) {
      console.log('Notifications not available - requesting permission...');
      await this.initialize();
      if (!this.isAvailable) return;
    }

    const title = 'Test Notification';
    const body = 'RetireOnSol notifications are working!';

    try {
      if (this.isNative) {
        const schedule: ScheduleOptions = {
          notifications: [
            {
              id: 999999,
              title,
              body,
              schedule: { at: new Date(Date.now() + 2000) },
              sound: 'default',
              smallIcon: 'ic_notification',
            },
          ],
        };

        await LocalNotifications.schedule(schedule);
        console.log('Native test notification scheduled');
      } else {
        setTimeout(() => {
          new Notification(title, { body, icon: 'icons/icon-192.png' });
        }, 2000);
        console.log('Web test notification scheduled');
      }
    } catch (error) {
      console.error('Error sending test notification:', error);
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
