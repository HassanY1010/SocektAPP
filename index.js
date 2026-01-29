// index.js
const io = require("socket.io")(3000, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const axios = require('axios');

// Configure Backend URL
const BACKEND_URL = "http://127.0.0.0:8000/api"; // Adjust this based on environment

// رسالة عند تشغيل السيرفر للتأكيد
console.log("🚀 Hardened Socket.IO server is running on port 3000");

// Middleware للتحقق من التوكن (Identity Verification Fix)
io.use(async (socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    if (!token) {
        return next(new Error("Authentication error: Token missing"));
    }

    try {
        // التحقق من التوكن عبر الـ Backend (Senior Hardening)
        const response = await axios.get(`${BACKEND_URL}/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        // ربط معرف المستخدم المقيد بالتوكن بالسوكت
        socket.verifiedUserId = response.data.user_id.toString();
        console.log(`✅ Token verified for user: ${socket.verifiedUserId}`);
        next();
    } catch (error) {
        console.error("❌ Token verification failed:", error.response?.status || error.message);
        return next(new Error("Authentication error: Invalid or expired token"));
    }
});

io.on("connection", (socket) => {
    console.log("✅ User connected:", socket.id);

    // الانضمام لغرفة خاصة بالمستخدم
    socket.on("join", (userId) => {
        // منع انتحال الشخصية: لا يسمح للمستخدم بالانضمام إلا لغرفته الخاصة (Security Fix)
        if (userId.toString() !== socket.verifiedUserId) {
            console.warn(`⚠️ User ${socket.id} tried to join room ${userId} but is verified as ${socket.verifiedUserId}`);
            return;
        }

        socket.join(userId.toString());
        console.log(`User ${socket.id} joined room: ${userId}`);
    });

    // استقبال رسالة وإرسالها للمستلم مباشرة
    socket.on("send_message", (data) => {
        // التأكد من أن المرسل هو صاحب المحادثة فعلاً
        if (data.senderId.toString() !== socket.verifiedUserId) {
            console.warn(`⚠️ User ${socket.id} tried to send message as ${data.senderId}`);
            return;
        }

        console.log(`Message from ${data.senderId} to ${data.receiverId}: ${data.message}`);
        io.to(data.receiverId.toString()).emit("receive_message", data);
    });

    // عند قطع الاتصال
    socket.on("disconnect", () => {
        console.log("❌ User disconnected:", socket.id);
    });
});
