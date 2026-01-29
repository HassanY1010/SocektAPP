// index.js
require('dotenv').config(); // Load env vars if locally present (optional, good for dev)
const http = require('http');
const { Server } = require("socket.io");
const axios = require('axios');

const PORT = process.env.PORT || 3000;
// Note: Railway usually provides PORT.
// BACKEND_URL should be set in Railway to https://backend-production.up.railway.app/api/v1
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000/api/v1";

// Create HTTP Server for Health Checks
const httpServer = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200);
        res.end('OK');
    } else {
        res.writeHead(404);
        res.end();
    }
});

const io = new Server(httpServer, {
    cors: {
        origin: "*", // Lock this down in production if possible to Admin/App domains
        methods: ["GET", "POST"]
    }
});

console.log(`🚀 Starting Socket Server...`);
console.log(`Backend URL: ${BACKEND_URL}`);

// Middleware for Token Verification
io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
        return next(new Error("Authentication error: Token missing"));
    }

    try {
        // Verify against Laravel Sanctum
        // Note: We use the API to verify. This decouples the database.
        const response = await axios.get(`${BACKEND_URL}/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
            timeout: 5000 // 5s timeout
        });

        if (response.status === 200 && response.data.user_id) {
            socket.verifiedUserId = response.data.user_id.toString();
            console.log(`✅ Token verified for user: ${socket.verifiedUserId}`);
            next();
        } else {
            throw new Error('Invalid response from auth server');
        }

    } catch (error) {
        console.error("❌ Token verification failed:", error.message);
        // Clean error message for client
        return next(new Error("Authentication error: Invalid or expired token"));
    }
});

io.on("connection", (socket) => {
    console.log(`✅ Connected: ${socket.id} (User: ${socket.verifiedUserId})`);

    // Join User's Private Room
    socket.on("join", (userId) => {
        // Security: Only allow joining own room
        if (userId.toString() !== socket.verifiedUserId) {
            console.warn(`⚠️ Security Alert: User ${socket.verifiedUserId} tried to join ${userId}`);
            return;
        }

        socket.join(userId.toString());
        console.log(`User ${socket.verifiedUserId} joined their private room.`);
    });

    // Send Message
    socket.on("send_message", (data) => {
        // Data should have { senderId, receiverId, message, ... }

        // Security: Ensure sender matches token
        if (data.senderId.toString() !== socket.verifiedUserId) {
            console.warn(`⚠️ Spoof Attempt: socket user ${socket.verifiedUserId} tried to send as ${data.senderId}`);
            return;
        }

        console.log(`Message from ${data.senderId} to ${data.receiverId}`);

        // Emit to Receiver's Room
        io.to(data.receiverId.toString()).emit("receive_message", data);

        // Optional: Emit to Sender (ack) or they handle it locally
    });

    socket.on("disconnect", () => {
        // console.log("User disconnected:", socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`🚀 Socket Server running on port ${PORT}`);
});
