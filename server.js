const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const rooms = {};

console.log(`🦆 Duck Relay Server (Godot 4.5) started on port ${PORT}`);

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case "host": {
                    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                    rooms[roomId] = { host: ws, clients: [] };
                    ws.roomId = roomId;
                    ws.isHost = true;
                    ws.send(JSON.stringify({ type: "host_success", roomId }));
                    console.log(`[HOST] Room Created: ${roomId}`);
                    break;
                }

                case "join": {
                    const roomId = data.roomId;
                    if (rooms[roomId]) {
                        ws.roomId = roomId;
                        ws.isHost = false;
                        rooms[roomId].clients.push(ws);
                        // Notify host a new duck is joining
                        rooms[roomId].host.send(JSON.stringify({ type: "peer_connected", id: rooms[roomId].clients.length + 1 }));
                        ws.send(JSON.stringify({ type: "join_success", id: rooms[roomId].clients.length + 1 }));
                    } else {
                        ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
                    }
                    break;
                }

                case "relay": {
                    // This is the important part: it forwards the game data (movement/shooting)
                    const room = rooms[ws.roomId];
                    if (room) {
                        if (ws.isHost) {
                            // Send to all clients
                            room.clients.forEach(c => c.send(message));
                        } else {
                            // Send to host only
                            room.host.send(message);
                        }
                    }
                    break;
                }
            }
        } catch (e) { }
    });

    ws.on('close', () => {
        if (ws.roomId && rooms[ws.roomId]) {
            if (ws.isHost) delete rooms[ws.roomId];
        }
    });
});
