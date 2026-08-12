import 'dotenv/config';
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from 'cookie-parser';
import pool from './config/db.mjs';
import errorHandler from './middleware/errorHandler.mjs';
import authRoutes from './routes/authRoutes.mjs';
import walletRoutes from './routes/walletRoutes.mjs';
import bankAccountRoutes from "./routes/bankAccountRoutes.mjs";
import orderRoutes from "./routes/orderRoutes.mjs";
import { engine } from './engine/matchingEngine.mjs';
import { createServer } from 'http';
import { priceServer } from './websockets/priceServer.mjs';
import portfolioRoutes from './routes/portfolioRoutes.mjs';

const app =new express();
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());
app.use(cookieParser());

// Add this in server.mjs (ensure you imported 'engine' at the top!)
if (process.env.NODE_ENV !== 'production') {
    app.post('/api/debug/reset-engine', (req, res) => {
        engine.books.clear(); // Wipes the fast RAM memory
        console.log("[Debug] Engine RAM flushed.");
        res.status(200).json({ message: "Engine RAM wiped." });
    });
}

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use("/api/bank-accounts", bankAccountRoutes);
app.use("/api/orders", orderRoutes);
app.use('/api/portfolio', portfolioRoutes);

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

app.get("/health",(req,res)=>{
    res.status(200).send("Ohk Nexus Broker is running absolutely fine");
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

const httpServer = createServer(app);

priceServer.attach(httpServer);

engine.initialize()
    .then(() => {
        httpServer.listen(PORT, () => {
            console.log(`[Nexus Broker] HTTP + WebSocket running on port ${PORT}`);
            console.log('[Engine] Order matching engine active.');
        });
    })
    .catch(err => {
        console.error('[Engine] Failed to initialize:', err);
        process.exit(1);
    });