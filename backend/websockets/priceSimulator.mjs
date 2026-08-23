import pool from '../config/db.mjs';
import { priceServer } from './priceServer.mjs';

function nextPrice(currentPaise, volatility = 0.002) {
  const change = (Math.random() - 0.5) * 2 * volatility;
  const newPrice = Math.round(currentPaise * (1 + change));
  return Math.max(newPrice, 100);
}

const VOLATILITY_PROFILES = {
  high:   0.0015,   
  medium: 0.0008,   
  low:    0.0003, 
};

const HIGH_VOL   = ['ADANIENT', 'TATASTEEL', 'JSWSTEEL', 'TATAMOTORS'];
const LOW_VOL    = ['TCS', 'INFY', 'HDFCBANK', 'NESTLEIND', 'HINDUNILVR'];

function getVolatility(symbol) {
  if (HIGH_VOL.includes(symbol))  return VOLATILITY_PROFILES.high;
  if (LOW_VOL.includes(symbol))   return VOLATILITY_PROFILES.low;
  return VOLATILITY_PROFILES.medium;
}

class PriceSimulator {
  constructor() {
    this.prices = new Map();  
    this.interval = null;
  }

  async initialize() {

    const startingPrices = {
      RELIANCE: 245675, TCS: 382140, HDFCBANK: 167825,
      INFY: 183460, ICICIBANK: 124530, HINDUNILVR: 238915,
      ITC: 45680, SBIN: 81245, BAJFINANCE: 723490,
      BHARTIARTL: 156735, KOTAKBANK: 178960, LT: 345625,
      ASIANPAINT: 287640, AXISBANK: 112375, MARUTI: 1245680,
      WIPRO: 56730, ULTRACEMCO: 1023455, TITAN: 367890,
      SUNPHARMA: 156745, NESTLEIND: 234560, POWERGRID: 33425,
      NTPC: 37890, ONGC: 28945, HCLTECH: 167830, JSWSTEEL: 93460,
      TATASTEEL: 17845, ADANIENT: 298765, ADANIPORTS: 134580,
      BAJAJFINSV: 167835, DRREDDY: 678940, CIPLA: 156725,
      DIVISLAB: 456790, EICHERMOT: 482375, HEROMOTOCO: 523460,
      'BAJAJ-AUTO': 987645, 'M&M': 234570, TATAMOTORS: 102345,
      TECHM: 156780, INDUSINDBK: 145635, GRASIM: 267890,
      BRITANNIA: 567845, APOLLOHOSP: 678930, TATACONSUM: 112365,
      BPCL: 34580, COALINDIA: 47835, HDFCLIFE: 68945,
      SBILIFE: 167820, ICICIPRULI: 72345, ICICIGI: 186730,
      PIDILITIND: 298765,
    };

    const [rows] = await pool.query(
      `SELECT i.symbol, t.trade_price
       FROM instruments i
       LEFT JOIN trades t ON t.instrument_id = i.id
       WHERE i.is_active = TRUE
       ORDER BY t.executed_at DESC`
    );

    const seenSymbols = new Set();
    for (const row of rows) {
      if (!seenSymbols.has(row.symbol) && row.trade_price) {
        this.prices.set(row.symbol, parseInt(row.trade_price));
        seenSymbols.add(row.symbol);
      }
    }

    for (const [symbol, price] of Object.entries(startingPrices)) {
      if (!this.prices.has(symbol)) {
        this.prices.set(symbol, price);
      }
    }

    console.log(`[Simulator] Initialized with ${this.prices.size} instruments.`);
  }

  start(tickIntervalMs = 1500) {
    if (this.interval) return;
    const INDICES = {
      'NIFTY 50':   2487550,   
      'SENSEX':     8198420,   
      'BANK NIFTY': 5398675,   
      'NIFTY IT':   4023890,  
    };

    for (const [name, price] of Object.entries(INDICES)) {
      if (!this.prices.has(name)) this.prices.set(name, price);
    }
    this.interval = setInterval(() => {

      for (const [symbol, subscribers] of priceServer.subscriptions) {
        if (subscribers.size === 0) continue;

        const currentPrice = this.prices.get(symbol);
        if (!currentPrice) continue;

        const volatility = getVolatility(symbol);
        const newPrice   = nextPrice(currentPrice, volatility);
        this.prices.set(symbol, newPrice);

        priceServer.broadcastTrade(symbol, {
          price:      newPrice,
          quantity:   Math.floor(Math.random() * 100) + 1,
          tradeValue: newPrice * (Math.floor(Math.random() * 100) + 1),
          timestamp:  new Date().toISOString(),
        });
      }
      const INDEX_NAMES = ['NIFTY 50', 'SENSEX', 'BANK NIFTY', 'NIFTY IT'];
      for (const name of INDEX_NAMES) {
        const cur = this.prices.get(name);
        if (!cur) continue;
        const updated = nextPrice(cur, 0.0002);  
        this.prices.set(name, updated);
        priceServer.broadcastTrade(name, {
          price:      updated,
          quantity:   0,
          tradeValue: 0,
          timestamp:  new Date().toISOString(),
        });
      }
    }, tickIntervalMs);

    console.log(`[Simulator] Ticking every ${tickIntervalMs}ms.`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  getPrice(symbol) {
    return this.prices.get(symbol) ?? null;
  }
}

export const priceSimulator = new PriceSimulator();