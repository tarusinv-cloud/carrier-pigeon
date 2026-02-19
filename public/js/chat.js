const Chat = {
  socket: null,
  conversations: [],
  activeConvId: null,
  onlineUsers: new Set(),
  typingTimers: {},

  connect() {
    const token = localStorage.getItem('token');
    if (!token) return;
    Chat.socket = io({ auth: { token } });

    Chat.socket.on('new_message', (msg) => {
      // Update conversation list preview
      const conv = Chat.conversations.find(c => c.id === msg.conversation_id);
      if (conv) {
        conv.last_message = msg.content;
        conv.last_sender = msg.username;
        conv.last_message_at = msg.created_at;
        Chat.renderConversations();
      } else {
        Chat.loadConversations(); // new conv appeared
      }
      if (msg.conversation_id === Chat.activeConvId) {
        Chat.appendMessage(msg);
        Chat.scrollToBottom();
      }
    });

    Chat.socket.on('online_users', (ids) => {
      Chat.onlineUsers = new Set(ids);
      Chat.renderConversations();
      Chat.updateHeaderStatus();
    });

    Chat.socket.on('user_typing', ({ conversationId, username, userId }) => {
      if (conversationId !== Chat.activeConvId || userId === App.currentUser.id) return;
      $('#typing-indicator').textContent = `${username} is typing...`;
      clearTimeout(Chat.typingTimers[userId]);
      Chat.typingTimers[userId] = setTimeout(() => {
        $('#typing-indicator').textContent = '';
      }, 2000);
    });
  },

  disconnect() {
    Chat.socket?.disconnect();
    Chat.socket = null;
    Chat.conversations = [];
    Chat.activeConvId = null;
  },

  async loadConversations() {
    Chat.conversations = await api('/api/conversations');
    Chat.renderConversations();
  },

  renderConversations() {
    const list = $('#conversation-list');
    const filter = ($('#search-input').value || '').toLowerCase();
    list.innerHTML = '';

    const filtered = Chat.conversations.filter(c => {
      const name = Chat.convName(c).toLowerCase();
      return name.includes(filter);
    });

    if (filtered.length === 0) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">No conversations yet</div>';
      return;
    }

    for (const c of filtered) {
      const name = Chat.convName(c);
      const color = Chat.convColor(c);
      const isOnline = c.type === 'dm' && c.dm_user && Chat.onlineUsers.has(c.dm_user.id);
      const icon = c.type === 'group' ? '👥' : '';

      const item = el('div', { class: `conv-item${c.id === Chat.activeConvId ? ' active' : ''}`, onclick: () => Chat.openConversation(c.id) }, [
        el('div', { class: 'conv-avatar', style: `background:${color}` }, [icon || initials(name)]),
        el('div', { class: 'conv-info' }, [
          el('div', { class: 'conv-name', html: escapeHtml(name) + (isOnline ? ' <span class="online-dot"></span>' : '') }),
          el('div', { class: 'conv-preview', text: c.last_message ? `${c.last_sender ? c.last_sender + ': ' : ''}${c.last_message}` : 'No messages yet' })
        ]),
        el('div', { class: 'conv-time', text: timeAgo(c.last_message_at) })
      ]);
      list.appendChild(item);
    }
  },

  convName(c) {
    if (c.type === 'dm' && c.dm_user) return c.dm_user.username;
    return c.name || 'Group';
  },
  convColor(c) {
    if (c.type === 'dm' && c.dm_user) return c.dm_user.avatar_color;
    return '#6c5ce7';
  },

  async openConversation(id) {
    Chat.activeConvId = id;
    Chat.renderConversations();

    const conv = Chat.conversations.find(c => c.id === id);
    const name = Chat.convName(conv);
    const color = Chat.convColor(conv);

    $('#chat-empty').style.display = 'none';
    $('#chat-active').style.display = 'flex';
    $('#chat-main').classList.add('show');

    $('#chat-header-avatar').style.background = color;
    $('#chat-header-avatar').textContent = conv.type === 'group' ? '👥' : initials(name);
    $('#chat-header-name').textContent = name;
    Chat.updateHeaderStatus();

    $('#typing-indicator').textContent = '';
    $('#message-input').focus();

    // Join socket room
    Chat.socket?.emit('join_conversation', id);

    // Load messages
    const msgs = await api(`/api/conversations/${id}/messages`);
    const container = $('#messages-container');
    container.innerHTML = '';
    let lastDate = '';
    for (const m of msgs) {
      const msgDate = formatDate(m.created_at);
      if (msgDate !== lastDate) {
        container.appendChild(el('div', { class: 'msg-date-divider', text: msgDate }));
        lastDate = msgDate;
      }
      Chat.appendMessage(m, false);
    }
    Chat.scrollToBottom();
  },

  updateHeaderStatus() {
    const conv = Chat.conversations.find(c => c.id === Chat.activeConvId);
    if (!conv) return;
    if (conv.type === 'dm' && conv.dm_user) {
      $('#chat-header-status').textContent = Chat.onlineUsers.has(conv.dm_user.id) ? 'Online' : 'Offline';
      $('#chat-header-status').style.color = Chat.onlineUsers.has(conv.dm_user.id) ? 'var(--success)' : 'var(--text-muted)';
    } else {
      const memberCount = conv.members?.length || 0;
      const onlineCount = conv.members?.filter(m => Chat.onlineUsers.has(m.id)).length || 0;
      $('#chat-header-status').textContent = `${memberCount} members, ${onlineCount} online`;
      $('#chat-header-status').style.color = 'var(--text-secondary)';
    }
  },

  appendMessage(msg, animate = true) {
    const container = $('#messages-container');
    const isOwn = msg.sender_id === App.currentUser.id;
    const conv = Chat.conversations.find(c => c.id === Chat.activeConvId);
    const showSender = conv?.type === 'group' && !isOwn;

    const msgEl = el('div', { class: `message ${isOwn ? 'own' : 'other'}` });
    if (showSender) {
      msgEl.appendChild(el('div', { class: 'msg-sender', text: msg.username, style: `color:${msg.avatar_color}` }));
    }
    msgEl.appendChild(el('div', { class: 'msg-bubble', text: msg.content }));
    msgEl.appendChild(el('div', { class: 'msg-time', text: formatTime(msg.created_at) }));
    if (!animate) msgEl.style.animation = 'none';
    container.appendChild(msgEl);
  },

  scrollToBottom() {
    const c = $('#messages-container');
    requestAnimationFrame(() => c.scrollTop = c.scrollHeight);
  },

  sendMessage() {
    const input = $('#message-input');
    const content = input.value.trim();
    if (!content || !Chat.activeConvId) return;
    Chat.socket.emit('send_message', { conversationId: Chat.activeConvId, content });
    input.value = '';
    input.focus();
  },

  emitTyping() {
    if (!Chat.activeConvId) return;
    Chat.socket?.emit('typing', { conversationId: Chat.activeConvId });
  },

  // --- Modals ---
  showNewChatModal() {
    Chat.showModal('New Conversation', `
      <input class="modal-input" id="modal-search" placeholder="Search users by name or email..." autocomplete="off">
      <div id="modal-results"></div>
    `);
    let timer;
    $('#modal-search').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => Chat.searchUsers(e.target.value), 300);
    });
    $('#modal-search').focus();
  },

  async searchUsers(q) {
    if (!q || q.length < 1) { $('#modal-results').innerHTML = ''; return; }
    const users = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
    const results = $('#modal-results');
    results.innerHTML = '';
    for (const u of users) {
      results.appendChild(el('div', { class: 'user-result', onclick: () => Chat.startDM(u.id) }, [
        el('div', { class: 'conv-avatar', style: `background:${u.avatar_color}`, text: initials(u.username) }),
        el('span', { text: `${u.username} (${u.email})` })
      ]));
    }
    if (users.length === 0) results.innerHTML = '<div style="padding:10px;color:var(--text-muted)">No users found</div>';
  },

  async startDM(userId) {
    const conv = await api('/api/conversations/dm', { method: 'POST', body: JSON.stringify({ userId }) });
    Chat.closeModal();
    await Chat.loadConversations();
    Chat.openConversation(conv.id);
  },

  showNewGroupModal() {
    Chat.showModal('Create Group', `
      <input class="modal-input" id="group-name" placeholder="Group name" autocomplete="off">
      <input class="modal-input" id="group-search" placeholder="Add members..." autocomplete="off">
      <div id="group-members"></div>
      <div id="group-results"></div>
      <button class="modal-btn" id="group-create">Create Group</button>
    `);
    Chat._groupMembers = [];
    let timer;
    $('#group-search').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => Chat.searchGroupUsers(e.target.value), 300);
    });
    $('#group-create').addEventListener('click', () => Chat.createGroup());
    $('#group-name').focus();
  },

  async searchGroupUsers(q) {
    if (!q) { $('#group-results').innerHTML = ''; return; }
    const users = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
    const results = $('#group-results');
    results.innerHTML = '';
    for (const u of users) {
      if (Chat._groupMembers.find(m => m.id === u.id)) continue;
      results.appendChild(el('div', { class: 'user-result', onclick: () => Chat.addGroupMember(u) }, [
        el('div', { class: 'conv-avatar', style: `background:${u.avatar_color}`, text: initials(u.username) }),
        el('span', { text: u.username })
      ]));
    }
  },

  addGroupMember(user) {
    Chat._groupMembers.push(user);
    Chat.renderGroupMembers();
    $('#group-search').value = '';
    $('#group-results').innerHTML = '';
  },

  renderGroupMembers() {
    const el2 = $('#group-members');
    el2.innerHTML = '';
    for (const m of Chat._groupMembers) {
      const chip = el('span', { class: 'member-chip' }, [
        m.username,
        el('button', { text: '✕', onclick: () => { Chat._groupMembers = Chat._groupMembers.filter(x => x.id !== m.id); Chat.renderGroupMembers(); } })
      ]);
      el2.appendChild(chip);
    }
  },

  async createGroup() {
    const name = $('#group-name').value.trim();
    if (!name) return;
    const memberIds = Chat._groupMembers.map(m => m.id);
    await api('/api/conversations/group', { method: 'POST', body: JSON.stringify({ name, memberIds }) });
    Chat.closeModal();
    await Chat.loadConversations();
  },

  showModal(title, bodyHtml) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = bodyHtml;
    $('#modal-overlay').style.display = 'flex';
  },

  closeModal() {
    $('#modal-overlay').style.display = 'none';
  }
};
