require('dotenv').config({ override: true });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { router: authRouter, authMiddleware, socketAuth } = require('./auth');
const { stmts, getOrCreateDM, createGroup } = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api/auth', authRouter);

// --- REST API ---
app.get('/api/conversations', authMiddleware, (req, res) => {
  const convs = stmts.getConversations.all(req.user.id);
  // For DMs, attach the other user's info
  for (const c of convs) {
    c.members = stmts.getMembers.all(c.id);
    if (c.type === 'dm') {
      const other = c.members.find(m => m.id !== req.user.id);
      if (other) { c.dm_user = other; }
    }
  }
  res.json(convs);
});

app.get('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  if (!stmts.isMember.get(req.params.id, req.user.id)) return res.status(403).json({ error: 'Not a member' });
  res.json(stmts.getMessages.all(req.params.id));
});

app.post('/api/conversations/dm', authMiddleware, (req, res) => {
  const { userId } = req.body;
  if (!userId || userId === req.user.id) return res.status(400).json({ error: 'Invalid user' });
  const convId = getOrCreateDM(req.user.id, userId);
  const conv = { id: convId, type: 'dm', members: stmts.getMembers.all(convId) };
  conv.dm_user = conv.members.find(m => m.id !== req.user.id);
  res.json(conv);
});

app.post('/api/conversations/group', authMiddleware, (req, res) => {
  const { name, memberIds = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'Group name required' });
  const convId = createGroup(name, req.user.id, memberIds);
  res.json({ id: convId, type: 'group', name, members: stmts.getMembers.all(convId) });
});

app.post('/api/conversations/:id/join', authMiddleware, (req, res) => {
  const conv = stmts.getConversations.all(req.user.id).find(c => c.id === +req.params.id);
  // Allow joining groups
  stmts.addMember.run(+req.params.id, req.user.id);
  res.json({ ok: true });
});

app.get('/api/users/search', authMiddleware, (req, res) => {
  const q = `%${req.query.q || ''}%`;
  res.json(stmts.searchUsers.all(q, q, req.user.id));
});

// --- Socket.IO ---
const onlineUsers = new Map(); // userId -> Set<socketId>

io.use(socketAuth);

io.on('connection', (socket) => {
  const uid = socket.user.id;
  if (!onlineUsers.has(uid)) onlineUsers.set(uid, new Set());
  onlineUsers.get(uid).add(socket.id);

  // Join all conversation rooms
  const convs = stmts.getConversations.all(uid);
  for (const c of convs) socket.join(`conv:${c.id}`);

  // Broadcast online status
  io.emit('online_users', [...onlineUsers.keys()]);

  socket.on('send_message', ({ conversationId, content }) => {
    if (!content?.trim() || !conversationId) return;
    if (!stmts.isMember.get(conversationId, uid)) return;

    const result = stmts.insertMessage.run(conversationId, uid, content.trim());
    const user = stmts.getUserById.get(uid);
    const msg = {
      id: result.lastInsertRowid,
      conversation_id: conversationId,
      sender_id: uid,
      username: user.username,
      avatar_color: user.avatar_color,
      content: content.trim(),
      created_at: new Date().toISOString()
    };
    io.to(`conv:${conversationId}`).emit('new_message', msg);
  });

  socket.on('join_conversation', (convId) => {
    if (stmts.isMember.get(convId, uid)) socket.join(`conv:${convId}`);
  });

  socket.on('typing', ({ conversationId }) => {
    const user = stmts.getUserById.get(uid);
    socket.to(`conv:${conversationId}`).emit('user_typing', { conversationId, username: user.username, userId: uid });
  });

  socket.on('disconnect', () => {
    onlineUsers.get(uid)?.delete(socket.id);
    if (onlineUsers.get(uid)?.size === 0) onlineUsers.delete(uid);
    io.emit('online_users', [...onlineUsers.keys()]);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🐦 Carrier Pigeon running on port ${PORT}`));
