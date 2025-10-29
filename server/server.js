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

const users = new Map();

io.on('connection', (socket) => {
  console.log('✅ کاربر متصل شد:', socket.id);
  
  users.set(socket.id, { id: socket.id });
  
  socket.emit('user-connected', {
    userId: socket.id,
    onlineUsers: Array.from(users.keys()).filter(id => id !== socket.id)
  });
  
  socket.broadcast.emit('user-joined', socket.id);
  
  socket.on('start-call', (data) => {
    console.log('📞 تماس از', socket.id, 'به', data.targetUser);
    socket.to(data.targetUser).emit('incoming-call', {
      from: socket.id,
      offer: data.offer,
      callerName: data.callerName || 'کاربر'
    });
  });
  
  socket.on('accept-call', (data) => {
    console.log('✅ تماس پذیرفته شد توسط:', socket.id);
    socket.to(data.targetUser).emit('call-accepted', {
      from: socket.id,
      answer: data.answer
    });
  });
  
  socket.on('reject-call', (data) => {
    socket.to(data.targetUser).emit('call-rejected', { from: socket.id });
  });
  
  socket.on('ice-candidate', (data) => {
    socket.to(data.targetUser).emit('ice-candidate', {
      from: socket.id,
      candidate: data.candidate
    });
  });
  
  socket.on('end-call', (data) => {
    socket.to(data.targetUser).emit('call-ended', { from: socket.id });
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 کاربر قطع شد:', socket.id);
    users.delete(socket.id);
    socket.broadcast.emit('user-left', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎉 سرور اجرا شد: http://localhost:${PORT}`);
});
