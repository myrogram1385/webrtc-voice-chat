const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware برای سرو فایل‌های استاتیک
app.use(express.static(path.join(__dirname, '../public')));

// Route اصلی
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// مدیریت WebSocket connections
io.on('connection', (socket) => {
    console.log('✅ کاربر متصل شد:', socket.id);
    
    // ارسال شناسه کاربر به خودش
    socket.emit('user-id', socket.id);
    
    // اطلاع‌رسانی به سایر کاربران
    socket.broadcast.emit('user-connected', socket.id);
    
    // وقتی کاربر تماس را شروع می‌کند
    socket.on('call-user', (data) => {
        console.log('📞 تماس از:', socket.id, 'به:', data.to);
        socket.to(data.to).emit('incoming-call', {
            from: socket.id,
            offer: data.offer,
            username: data.username || 'کاربر ناشناس'
        });
    });
    
    // وقتی کاربر تماس را می‌پذیرد
    socket.on('accept-call', (data) => {
        console.log('✅ تماس پذیرفته شد توسط:', socket.id);
        socket.to(data.to).emit('call-accepted', {
            from: socket.id,
            answer: data.answer
        });
    });
    
    // ارسال ICE Candidate
    socket.on('ice-candidate', (data) => {
        socket.to(data.to).emit('ice-candidate', {
            from: socket.id,
            candidate: data.candidate
        });
    });
    
    // پایان تماس
    socket.on('end-call', (data) => {
        console.log('❌ تماس پایان یافت:', socket.id);
        socket.to(data.to).emit('call-ended', {
            from: socket.id,
            reason: data.reason || 'تماس به پایان رسید'
        });
    });
    
    // وقتی کاربر قطع می‌شود
    socket.on('disconnect', () => {
        console.log('🔌 کاربر قطع شد:', socket.id);
        socket.broadcast.emit('user-disconnected', socket.id);
    });
});

// راه‌اندازی سرور
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎉 سرور تماس صوتی روی پورت ${PORT} اجرا شد`);
    console.log(`🌐 آدرس: http://localhost:${PORT}`);
});
