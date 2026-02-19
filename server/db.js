const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'carrier-pigeon.db'));

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    username TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#6c5ce7',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('dm', 'group')),
    name TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER REFERENCES users(id),
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_conv_members ON conversation_members(user_id);
`);

// Prepared statements
const stmts = {
  createUser: db.prepare('INSERT INTO users (email, password, username, avatar_color) VALUES (?, ?, ?, ?)'),
  getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  getUserById: db.prepare('SELECT id, email, username, avatar_color, created_at FROM users WHERE id = ?'),
  searchUsers: db.prepare("SELECT id, email, username, avatar_color FROM users WHERE (username LIKE ? OR email LIKE ?) AND id != ? LIMIT 20"),

  createConversation: db.prepare('INSERT INTO conversations (type, name, created_by) VALUES (?, ?, ?)'),
  addMember: db.prepare('INSERT OR IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)'),
  removeMember: db.prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?'),
  getMembers: db.prepare(`
    SELECT u.id, u.username, u.avatar_color FROM users u
    JOIN conversation_members cm ON cm.user_id = u.id
    WHERE cm.conversation_id = ?
  `),

  getConversations: db.prepare(`
    SELECT c.*, 
      (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT u.username FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_sender,
      (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message_at
    FROM conversations c
    JOIN conversation_members cm ON cm.conversation_id = c.id
    WHERE cm.user_id = ?
    ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC
  `),

  findDM: db.prepare(`
    SELECT c.id FROM conversations c
    JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ?
    JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ?
    WHERE c.type = 'dm'
    LIMIT 1
  `),

  getMessages: db.prepare(`
    SELECT m.*, u.username, u.avatar_color FROM messages m
    JOIN users u ON u.id = m.sender_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at ASC
    LIMIT 200
  `),

  insertMessage: db.prepare('INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)'),

  isMember: db.prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?'),
};

// Helper: get or create DM conversation
function getOrCreateDM(userId1, userId2) {
  const existing = stmts.findDM.get(userId1, userId2);
  if (existing) return existing.id;

  const result = stmts.createConversation.run('dm', null, userId1);
  const convId = result.lastInsertRowid;
  stmts.addMember.run(convId, userId1);
  stmts.addMember.run(convId, userId2);
  return convId;
}

// Helper: create group
function createGroup(name, creatorId, memberIds) {
  const result = stmts.createConversation.run('group', name, creatorId);
  const convId = result.lastInsertRowid;
  stmts.addMember.run(convId, creatorId);
  for (const id of memberIds) {
    if (id !== creatorId) stmts.addMember.run(convId, id);
  }
  return convId;
}

module.exports = { db, stmts, getOrCreateDM, createGroup };
