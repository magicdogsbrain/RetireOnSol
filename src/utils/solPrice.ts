/**
 * Fetch current SOL price from CoinGecko API with localStorage caching
 */

const COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
const CACHE_KEY = 'retireonsol_sol_price';
const CACHE_DURATION_MS = 60 * 1000; // 1 minute

export interface PriceData {
  price: number;
  lastUpdated: Date;
}

interface CachedPrice {
  price: number;
  timestamp: number;
}

function getCachedPrice(): CachedPrice | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // localStorage not available or parse error
  }
  return null;
}

function setCachedPrice(price: number): void {
  try {
    const data: CachedPrice = {
      price,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // localStorage not available
  }
}

function isCacheStale(cached: CachedPrice): boolean {
  return Date.now() - cached.timestamp > CACHE_DURATION_MS;
}

export async function fetchSOLPrice(): Promise<PriceData> {
  const cached = getCachedPrice();

  // If we have a fresh cache, return it immediately
  if (cached && !isCacheStale(cached)) {
    return {
      price: cached.price,
      lastUpdated: new Date(cached.timestamp),
    };
  }

  try {
    const response = await fetch(
      `${COINGECKO_API}?ids=solana&vs_currencies=usd`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch price');
    }

    const data = await response.json();
    const price = data.solana.usd;

    // Cache the new price
    setCachedPrice(price);

    return {
      price,
      lastUpdated: new Date(),
    };
  } catch (error) {
    console.error('Error fetching SOL price:', error);

    // If we have a stale cache, use it rather than failing
    if (cached) {
      console.log('Using stale cached price');
      return {
        price: cached.price,
        lastUpdated: new Date(cached.timestamp),
      };
    }

    // No cache available - this should only happen on first ever load with no network
    throw new Error('No price available - please connect to the internet');
  }
}

// Start periodic price refresh (call this once from App)
let refreshInterval: ReturnType<typeof setInterval> | null = null;

export function startPriceRefresh(onPriceUpdate: (price: number) => void): () => void {
  // Clear any existing interval
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  // Refresh every 5 minutes
  refreshInterval = setInterval(async () => {
    try {
      const data = await fetchSOLPrice();
      onPriceUpdate(data.price);
    } catch {
      // Silently fail on refresh - we'll use cached value
    }
  }, CACHE_DURATION_MS);

  // Return cleanup function
  return () => {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  };
}
