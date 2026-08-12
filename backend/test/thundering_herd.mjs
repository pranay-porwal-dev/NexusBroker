// test_thundering_herd.mjs
// Simulates 50 simultaneous subscribers to verify Promise coalescing works.
// Run: node test_thundering_herd.mjs
// Watch server logs — should see exactly 1 DB query, not 50.

import { WebSocket } from 'ws';

const NUM_CLIENTS = 50;
const WS_URL = 'ws://localhost:3000';

console.log(`Firing ${NUM_CLIENTS} simultaneous subscribe requests...`);
console.log('Watch server logs for DB query count (should be 1, not 50)\n');

const clients = [];
const results = { subscribed: 0, errors: 0 };

// Open all connections simultaneously
const promises = Array.from({ length: NUM_CLIENTS }, (_, i) => {
    return new Promise((resolve) => {
        const ws = new WebSocket(WS_URL);

        ws.on('open', () => {
            // All clients subscribe to the same symbol at the same time
            ws.send(JSON.stringify({ type: 'subscribe', symbol: 'RELIANCE' }));
        });

        ws.on('message', (raw) => {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'subscribed') {
                results.subscribed++;
                ws.close();
                resolve();
            } else if (msg.type === 'error') {
                results.errors++;
                ws.close();
                resolve();
            }
        });

        ws.on('error', () => {
            results.errors++;
            resolve();
        });

        clients.push(ws);
    });
});

await Promise.all(promises);

console.log(`Results: ${results.subscribed} subscribed, ${results.errors} errors`);
console.log(`Expected: ${NUM_CLIENTS} subscribed, 0 errors`);
console.log('\nIf server logs show only 1 DB query for RELIANCE → thundering herd fix works ✓');