const { WebSocketServer } = require('ws');

// Use port from environment variable (for hosting services like Render/Railway) or 8080 locally
const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const rooms = {}; // room_id: { host: socket, nextPlayerId: 2 }

console.log(`🦆 Duck Signaling Server started on port ${PORT}`);

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case "host": {
                    // Generate a random 6-character Room ID
                    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                    rooms[roomId] = { host: ws, nextPlayerId: 2 };
                    
                    ws.roomId = roomId;
                    ws.isHost = true;
                    
                    ws.send(JSON.stringify({ 
                        type: "host_success", 
                        roomId: roomId 
                    }));
                    
                    console.log(`[HOST] Room Created: ${roomId}`);
                    break;
                }

                case "join": {
                    const roomId = data.roomId;
                    if (rooms[roomId]) {
                        ws.roomId = roomId;
                        ws.isHost = false;
                        
                        // Assign a unique peer ID for this client (Host is always 1)
                        const pId = rooms[roomId].nextPlayerId++;
                        ws.pId = pId;
                        
                        // Notify host that a new peer wants to connect
                        rooms[roomId].host.send(JSON.stringify({ 
                            type: "peer_joined", 
                            id: pId 
                        }));
                        
                        // Tell client they successfully joined signaling
                        ws.send(JSON.stringify({ 
                            type: "join_success", 
                            id: pId 
                        }));
                        
                        console.log(`[JOIN] Peer ${pId} joined Room: ${roomId}`);
                    } else {
                        ws.send(JSON.stringify({ 
                            type: "error", 
                            message: "Room ID not found!" 
                        }));
                    }
                    break;
                }

                case "signal": {
                    // Forward WebRTC SDP/ICE signals between players
                    const targetRoom = rooms[ws.roomId];
                    if (!targetRoom) return;

                    if (ws.isHost) {
                        // Host is sending a signal to a specific client (data.id)
                        wss.clients.forEach(client => {
                            if (client.roomId === ws.roomId && client.pId === data.id) {
                                client.send(JSON.stringify(data));
                            }
                        });
                    } else {
                        // Client is sending a signal back to the Host
                        targetRoom.host.send(JSON.stringify({ 
                            ...data, 
                            id: ws.pId // Include client's ID so host knows who it is
                        }));
                    }
                    break;
                }
            }
        } catch (e) {
            console.error("Error processing message:", e);
        }
    });

    ws.on('close', () => {
        if (ws.roomId && rooms[ws.roomId]) {
            if (ws.isHost) {
                console.log(`[CLOSED] Host left. Closing Room: ${ws.roomId}`);
                // Notify all clients in that room (optional, WebRTC will detect disconnect)
                delete rooms[ws.roomId];
            } else {
                console.log(`[LEFT] Peer ${ws.pId} left Room: ${ws.roomId}`);
            }
        }
    });
});
