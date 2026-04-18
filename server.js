const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });
const rooms = {};

console.log(`📡 Duck Signaling Server started on port ${PORT}`);

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case "host": {
                    // Create a 6-character Room ID
                    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                    rooms[roomId] = { host: ws, peers: {} };
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
                        ws.peerId = data.peer_id;
                        
                        rooms[roomId].peers[data.peer_id] = ws;
                        
                        console.log(`[JOIN] Peer ${data.peer_id} wants to join Room ${roomId}. Notifying Host...`);
                        
                        rooms[roomId].host.send(JSON.stringify({ 
                            type: "peer_joined", 
                            peer_id: data.peer_id 
                        }));
                        
                        ws.send(JSON.stringify({ type: "join_success", roomId }));
                    } else {
                        console.log(`[JOIN FAIL] Room ${roomId} not found.`);
                        ws.send(JSON.stringify({ type: "error", message: "Room not found" }));
                    }
                    break;
                }

                case "signal": {
                    // Relay WebRTC handshake (offer/answer/candidates)
                    const roomId = ws.roomId;
                    const room = rooms[roomId];
                    if (!room) return;

                    if (ws.isHost) {
                        // Host -> Specific Peer
                        const targetPeer = room.peers[data.peer_id];
                        if (targetPeer) targetPeer.send(message);
                    } else {
                        // Peer -> Host (Attach sender's peerId so host knows who it is)
                        data.peer_id = ws.peerId; 
                        room.host.send(JSON.stringify(data));
                    }
                    break;
                }
            }
        } catch (e) { }
    });

    ws.on('close', () => {
        if (ws.roomId && rooms[ws.roomId]) {
            if (ws.isHost) {
                // If host leaves, notify all and kill room
                Object.values(rooms[ws.roomId].peers).forEach(p => p.send(JSON.stringify({type: "error", message: "Host disconnected"})));
                delete rooms[ws.roomId];
                console.log(`[CLOSED] Host left, Room ${ws.roomId} deleted`);
            } else {
                // Peer left
                const room = rooms[ws.roomId];
                if (room && room.host) {
                    room.host.send(JSON.stringify({ type: "peer_left", peer_id: ws.peerId }));
                    delete room.peers[ws.peerId];
                }
            }
        }
    });
});
