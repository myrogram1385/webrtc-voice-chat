const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// تنظیمات CORS برای اجازه دسترسی از همه IPها
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// سرو فایل‌های استاتیک
app.use(express.static(path.join(__dirname, '../public')));

// ذخیره کاربران آنلاین
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log('🎯 کاربر جدید متصل شد:', socket.id);
    
    // اضافه کردن کاربر به لیست آنلاین
    onlineUsers.set(socket.id, {
        id: socket.id,
        connectedAt: new Date()
    });
    
    // ارسال شناسه به کاربر
    socket.emit('user-connected', {
        userId: socket.id,
        onlineUsers: Array.from(onlineUsers.keys()).filter(id => id !== socket.id)
    });
    
    // اطلاع به سایر کاربران
    socket.broadcast.emit('user-joined', socket.id);
    
    // شروع تماس
    socket.on('start-call', (data) => {
        console.log('📞 درخواست تماس از:', socket.id, 'به:', data.targetUser);
        socket.to(data.targetUser).emit('incoming-call', {
            from: socket.id,
            offer: data.offer,
            callerName: data.callerName || 'کاربر ناشناس'
        });
    });
    
    // پذیرش تماس
    socket.on('accept-call', (data) => {
        console.log('✅ تماس پذیرفته شد توسط:', socket.id);
        socket.to(data.targetUser).emit('call-accepted', {
            from: socket.id,
            answer: data.answer
        });
    });
    
    // رد تماس
    socket.on('reject-call', (data) => {
        socket.to(data.targetUser).emit('call-rejected', {
            from: socket.id
        });
    });
    
    // ارسال ICE candidates
    socket.on('ice-candidate', (data) => {
        socket.to(data.targetUser).emit('ice-candidate', {
            from: socket.id,
            candidate: data.candidate
        });
    });
    
    // پایان تماس
    socket.on('end-call', (data) => {
        console.log('❌ پایان تماس توسط:', socket.id);
        if (data.targetUser) {
            socket.to(data.targetUser).emit('call-ended', {
                from: socket.id,
                reason: 'تماس توسط کاربر مقابل پایان یافت'
            });
        }
    });
    
    // ارسال پیام چت
    socket.on('send-message', (data) => {
        socket.to(data.targetUser).emit('new-message', {
            from: socket.id,
            message: data.message,
            timestamp: new Date()
        });
    });
    
    // وقتی کاربر قطع می‌شود
    socket.on('disconnect', () => {
        console.log('🔌 کاربر قطع شد:', socket.id);
        onlineUsers.delete(socket.id);
        socket.broadcast.emit('user-left', socket.id);
    });
});

// اجرای سرور روی همه IPها
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log('🎉 سرور تماس صوتی اجرا شد!');
    console.log(`📍 آدرس محلی: http://localhost:${PORT}`);
    console.log(`🌐 آدرس شبکه: http://YOUR-IP:${PORT}`);
    console.log('📱 از دو گوشی مختلف به آدرس بالا وصل شوید');
});
