import express from 'express';
import { createServer } from 'http';
import { priceServer } from '../websockets/priceServer.mjs'; // Adjust path as needed

const app = express();
const server = createServer(app);

// 1. Attach the WebSocket Server
priceServer.attach(server);

// 2. The Publisher (Mock Matching Engine)
// This simulates a trade happening every 5 seconds
setInterval(() => {
    // Generate a random price between ₹2400 and ₹2600 (in paise)
    const mockPrice = Math.floor(Math.random() * 20000) + 240000;
    
    const tradeData = {
        price: mockPrice,
        quantity: 10,
        tradeValue: mockPrice * 10,
        timestamp: Date.now()
    };

    console.log(`\n[MOCK ENGINE] Trade Executed: RELIANCE @ ₹${mockPrice / 100}`);
    
    // Hand it to the Radio Tower
    priceServer.broadcastTrade('RELIANCE', tradeData);
}, 5000);

server.listen(3000, () => {
    console.log('Test Server running on http://localhost:3000');
    console.log('Waiting for WebSocket connections...');
});