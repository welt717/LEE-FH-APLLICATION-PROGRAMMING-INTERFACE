// websocketServer.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3001 }); // separate port from REST API

// Store connected clients
const clients = new Set();

wss.on('connection', (ws) => {
  console.log('📡 New client connected');
  clients.add(ws);

  ws.on('close', () => {
    console.log('❌ Client disconnected');
    clients.delete(ws);
  });
});

// Export a function to broadcast notifications
function broadcastNotification(notification) {
  const message = JSON.stringify({
    type: 'new_notification',
    data: notification,
  });

  for (let client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

module.exports = { broadcastNotification };
