const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, '../public')));

const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('👤 کاربر جدید متصل شد:', socket.id);
  
  onlineUsers.set(socket.id, {
    id: socket.id,
    name: `User_${socket.id.substring(0, 6)}`,
    joinedAt: new Date()
  });
  
  socket.emit('connection-established', {
    userId: socket.id,
    userList: Array.from(onlineUsers.values()).filter(user => user.id !== socket.id)
  });
  
  socket.broadcast.emit('user-online', {
    id: socket.id,
    name: `User_${socket.id.substring(0, 6)}`
  });
  
  socket.on('initiate-call', (data) => {
    console.log('📞 درخواست تماس از', socket.id, 'به', data.targetUserId);
    socket.to(data.targetUserId).emit('incoming-call', {
      callerId: socket.id,
      callerName: data.callerName || `User_${socket.id.substring(0, 6)}`,
      offer: data.offer
    });
  });
  
  socket.on('accept-call', (data) => {
    console.log('✅ تماس پذیرفته شد توسط:', socket.id);
    socket.to(data.callerId).emit('call-accepted', {
      answer: data.answer
    });
  });
  
  socket.on('reject-call', (data) => {
    socket.to(data.callerId).emit('call-rejected');
  });
  
  socket.on('end-call', (data) => {
    if (data.targetUserId) {
      socket.to(data.targetUserId).emit('call-ended');
    }
  });
  
  socket.on('ice-candidate', (data) => {
    socket.to(data.targetUserId).emit('ice-candidate', data.candidate);
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 کاربر قطع شد:', socket.id);
    onlineUsers.delete(socket.id);
    socket.broadcast.emit('user-offline', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 سرور تلگرام صوتی اجرا شد!');
  console.log('📍 آدرس محلی: http://localhost:' + PORT);
  console.log('🌐 برای اتصال از گوشی دیگر: http://YOUR-IP:' + PORT);
  console.log('📱 هر دو کاربر باید به یک WiFi متصل باشند');
});
