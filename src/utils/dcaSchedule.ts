/**
 * DCA Schedule Calculator
 *
 * Calculates DCA schedule dates, missed payments, and next due date
 * based on an activation date and frequency.
 */

export interface DCAScheduleResult {
  nextDCADate: Date;
  missedCount: number;
  missedTotal: number; // missedCount * dcaAmount
  totalDueCount: number; // how many DCAs should have happened since activation
  completedEstimate: number; // totalDue - missed (we can't verify on-chain)
  allDueDates: Date[]; // list of all DCA dates from activation to now
}

/**
 * Add one period to a date based on frequency.
 * Handles month overflow correctly.
 */
function addPeriod(
  date: Date,
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
): Date {
  const next = new Date(date);
  switch (frequency) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

/**
 * Calculate the DCA schedule from activation date to now.
 *
 * @param activatedAt - ISO date string of when the plan was activated
 * @param dcaFrequency - How often DCA should happen
 * @param dcaAmountUSD - Dollar amount per DCA
 * @param now - Optional override for current date (useful for testing)
 * @returns DCAScheduleResult
 */
export function calculateDCASchedule(
  activatedAt: string,
  dcaFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
  dcaAmountUSD: number,
  now?: Date
): DCAScheduleResult {
  const currentDate = now ?? new Date();
  const activationDate = new Date(activatedAt);

  // First DCA is one period after activation
  let dcaDate = addPeriod(activationDate, dcaFrequency);
  const allDueDates: Date[] = [];

  // Collect all DCA dates that have passed
  while (dcaDate <= currentDate) {
    allDueDates.push(new Date(dcaDate));
    dcaDate = addPeriod(dcaDate, dcaFrequency);
  }

  const totalDueCount = allDueDates.length;

  // Next DCA date is the first one in the future
  const nextDCADate = new Date(dcaDate);

  // For now, we assume ALL due DCAs are "missed" since we can't verify on-chain.
  // In a future version, we could track completed DCAs in localStorage or check tx history.
  const missedCount = totalDueCount;
  const missedTotal = missedCount * dcaAmountUSD;
  const completedEstimate = 0; // Can't verify without on-chain data

  return {
    nextDCADate,
    missedCount,
    missedTotal,
    totalDueCount,
    completedEstimate,
    allDueDates,
  };
}

/**
 * Format a relative date string like "Tomorrow", "In 3 days", "In 2 weeks"
 */
export function formatRelativeDate(date: Date, now?: Date): string {
  const currentDate = now ?? new Date();
  const diffMs = date.getTime() - currentDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays} days`;
  if (diffDays < 14) return 'In 1 week';
  if (diffDays < 30) return `In ${Math.floor(diffDays / 7)} weeks`;
  if (diffDays < 60) return 'In 1 month';
  return `In ${Math.floor(diffDays / 30)} months`;
}

/**
 * Calculate days since a given ISO date
 */
export function daysSince(isoDate: string, now?: Date): number {
  const currentDate = now ?? new Date();
  const start = new Date(isoDate);
  const diffMs = currentDate.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}
