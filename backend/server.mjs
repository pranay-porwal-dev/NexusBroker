import 'dotenv/config';
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from 'cookie-parser';
import pool from './config/db.mjs';
import cors from 'cors';
import { createServer } from 'http';

import errorHandler from './middleware/errorHandler.mjs';
import authRoutes from './routes/authRoutes.mjs';
import walletRoutes from './routes/walletRoutes.mjs';
import bankAccountRoutes from "./routes/bankAccountRoutes.mjs";
import orderRoutes from "./routes/orderRoutes.mjs";
import { engine } from './engine/matchingEngine.mjs';
import { priceServer } from './websockets/priceServer.mjs';
import { priceSimulator } from './websockets/priceSimulator.mjs';
import portfolioRoutes from './routes/portfolioRoutes.mjs';
import instrumentRoutes from './routes/instrumentRoutes.mjs';

const app =new express();
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',           
  process.env.FRONTEND_URL,      
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use("/api/bank-accounts", bankAccountRoutes);
app.use("/api/orders", orderRoutes);
app.use('/api/portfolio', portfolioRoutes);
app.use('/api/instruments', instrumentRoutes);


// Debug: see what's in the order book right now
app.get('/api/debug/orderbook/:symbol', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Not in production' });
  const { symbol } = req.params;
  const [rows] = await pool.execute('SELECT id FROM instruments WHERE symbol = ?', [symbol.toUpperCase()]);
  if (!rows.length) return res.status(404).json({ error: 'Instrument not found' });
  const snapshot = engine.getBookSnapshot(rows[0].id);
  res.json({ data: snapshot || { bids: [], asks: [], symbol } });
});

// Debug: force-run matching loop for a symbol
app.post('/api/debug/match/:symbol', async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(403).json({ error: 'Not in production' });
  const { symbol } = req.params;
  const [rows] = await pool.execute('SELECT id FROM instruments WHERE symbol = ?', [symbol.toUpperCase()]);
  if (!rows.length) return res.status(404).json({ error: 'Instrument not found' });
  const book = engine.books.get(rows[0].id);
  if (!book) return res.status(404).json({ error: 'No order book for this instrument' });
  const snapshot = book.getSnapshot();
  res.json({ 
    before: snapshot,
    hasMatch: book.hasMatch(),
    bestBid: book.getBestBid(),
    bestAsk: book.getBestAsk(),
  });
});

app.get('/api/debug/ws-stats', (req, res) => {
    res.json(priceServer.getStats());
});

app.post('/api/debug/reset-engine', async (req, res) => {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Not available in production' });
    }

    try {
        await engine.initialize(); 
        priceServer.subscriptions.clear();
        priceServer.lastPrices.clear();
        console.log('[Debug] Engine and price server reset.');
        res.json({ message: 'Engine reset complete' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString() 
  });
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

const httpServer = createServer(app);
priceServer.attach(httpServer);

engine.initialize()
  .then(() => priceSimulator.initialize())
  .then(() => {
    priceServer.getFallbackPrice = (symbol) => priceSimulator.getPrice(symbol);
    priceSimulator.start(1500);   // tick every 1.5 seconds
    httpServer.listen(PORT, () => {
      console.log(`[Nexus Broker] HTTP + WebSocket running on port ${PORT}`);
      console.log('[Engine] Order matching engine active.');
      console.log('[Simulator] Price simulation active.');
    });
  })
  .catch(err => {
        console.error('[Engine] Failed to initialize:', err);
        process.exit(1);
    });