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
      const conv = Chat.conversations.find(c => c.id === msg.conversation_id);
      if (conv) {
        conv.last_message = msg.content;
        conv.last_sender = msg.username;
        conv.last_message_at = msg.created_at;
        Chat.renderConversations();
      } else {
        Chat.loadConversations();
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
      $('#typing-indicator').textContent = `${username} печатает...`;
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
      list.innerHTML = '<div class="empty-convs"><div class="empty-icon">🐦</div><div>Нет диалогов</div></div>';
      return;
    }

    for (const c of filtered) {
      const name = Chat.convName(c);
      const isOnline = c.type === 'dm' && c.dm_user && Chat.onlineUsers.has(c.dm_user.id);

      const item = document.createElement('div');
      item.className = 'conv-item';
      item.onclick = () => Chat.openConversation(c.id);

      // Avatar
      const avatarEl = document.createElement('div');
      avatarEl.className = 'conv-avatar';

      if (c.type === 'group' && c.members && c.members.length > 1) {
        avatarEl.classList.add('group-avatar');
        const shown = c.members.slice(0, 4);
        for (const m of shown) {
          const cell = document.createElement('div');
          cell.className = 'ga-cell';
          cell.style.background = m.avatar_color;
          cell.textContent = initials(m.username);
          avatarEl.appendChild(cell);
        }
      } else {
        avatarEl.style.background = Chat.convColor(c);
        avatarEl.textContent = initials(name);
      }

      // Online badge for DM
      if (isOnline) {
        const badge = document.createElement('div');
        badge.className = 'avatar-badge badge-online';
        avatarEl.style.position = 'relative';
        avatarEl.style.overflow = 'visible';
        avatarEl.appendChild(badge);
      }

      item.appendChild(avatarEl);

      // Body
      const body = document.createElement('div');
      body.className = 'conv-body';

      const row = document.createElement('div');
      row.className = 'conv-row';

      const nameEl = document.createElement('div');
      nameEl.className = 'conv-name';
      nameEl.textContent = name;

      const dateEl = document.createElement('div');
      dateEl.className = 'conv-date';
      dateEl.textContent = formatDateShort(c.last_message_at);

      row.appendChild(nameEl);
      row.appendChild(dateEl);

      const preview = document.createElement('div');
      preview.className = 'conv-preview';
      if (c.last_message) {
        const isMine = c.last_sender === App.currentUser?.username;
        preview.textContent = (isMine ? 'Вы: ' : '') + c.last_message;
      }

      body.appendChild(row);
      body.appendChild(preview);
      item.appendChild(body);
      list.appendChild(item);
    }
  },

  convName(c) {
    if (c.type === 'dm' && c.dm_user) return c.dm_user.username;
    return c.name || 'Группа';
  },
  convColor(c) {
    if (c.type === 'dm' && c.dm_user) return c.dm_user.avatar_color;
    return '#8b7afd';
  },

  async openConversation(id) {
    Chat.activeConvId = id;
    App.showTab('chat-view');

    const conv = Chat.conversations.find(c => c.id === id);
    const name = Chat.convName(conv);
    const color = Chat.convColor(conv);

    $('#chat-header-avatar').style.background = color;
    $('#chat-header-avatar').textContent = conv.type === 'group' ? '👥' : initials(name);
    $('#chat-header-name').textContent = name;
    Chat.updateHeaderStatus();

    $('#typing-indicator').textContent = '';
    $('#message-input').focus();

    Chat.socket?.emit('join_conversation', id);

    const msgs = await api(`/api/conversations/${id}/messages`);
    const container = $('#messages-container');
    container.innerHTML = '';
    let lastDate = '';
    for (const m of msgs) {
      const msgDate = formatDate(m.created_at);
      if (msgDate !== lastDate) {
        const div = document.createElement('div');
        div.className = 'msg-date-divider';
        div.textContent = msgDate;
        container.appendChild(div);
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
      const online = Chat.onlineUsers.has(conv.dm_user.id);
      $('#chat-header-status').textContent = online ? 'В сети' : 'Не в сети';
      $('#chat-header-status').style.color = online ? 'var(--green)' : 'var(--text-muted)';
    } else {
      const mc = conv.members?.length || 0;
      const oc = conv.members?.filter(m => Chat.onlineUsers.has(m.id)).length || 0;
      $('#chat-header-status').textContent = `${mc} участников, ${oc} в сети`;
      $('#chat-header-status').style.color = 'var(--text-secondary)';
    }
  },

  appendMessage(msg, animate = true) {
    const container = $('#messages-container');
    const isOwn = msg.sender_id === App.currentUser.id;
    const conv = Chat.conversations.find(c => c.id === Chat.activeConvId);
    const showSender = conv?.type === 'group' && !isOwn;

    const msgEl = document.createElement('div');
    msgEl.className = `message ${isOwn ? 'own' : 'other'}`;

    if (showSender) {
      const sender = document.createElement('div');
      sender.className = 'msg-sender';
      sender.textContent = msg.username;
      sender.style.color = msg.avatar_color;
      msgEl.appendChild(sender);
    }

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.content;
    msgEl.appendChild(bubble);

    const time = document.createElement('div');
    time.className = 'msg-time';
    time.textContent = formatTime(msg.created_at);
    msgEl.appendChild(time);

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
    Chat.showModal('Новый диалог', `
      <input class="modal-input" id="modal-search" placeholder="Поиск по имени или email..." autocomplete="off">
      <div id="modal-results"></div>
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px">
        <h4 style="margin-bottom:10px;font-size:15px">Создать группу</h4>
        <input class="modal-input" id="group-name" placeholder="Название группы" autocomplete="off">
        <input class="modal-input" id="group-search" placeholder="Добавить участников..." autocomplete="off">
        <div id="group-members"></div>
        <div id="group-results"></div>
        <button class="modal-btn" id="group-create">Создать группу</button>
      </div>
    `);
    let timer;
    $('#modal-search').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => Chat.searchUsers(e.target.value), 300);
    });
    let gTimer;
    $('#group-search').addEventListener('input', (e) => {
      clearTimeout(gTimer);
      gTimer = setTimeout(() => Chat.searchGroupUsers(e.target.value), 300);
    });
    $('#group-create').addEventListener('click', () => Chat.createGroup());
    $('#modal-search').focus();
  },

  async searchUsers(q) {
    if (!q || q.length < 1) { $('#modal-results').innerHTML = ''; return; }
    const users = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
    const results = $('#modal-results');
    results.innerHTML = '';
    for (const u of users) {
      const item = document.createElement('div');
      item.className = 'user-result';
      item.onclick = () => Chat.startDM(u.id);

      const av = document.createElement('div');
      av.className = 'conv-avatar';
      av.style.cssText = `background:${u.avatar_color};width:36px;height:36px;font-size:14px`;
      av.textContent = initials(u.username);

      const sp = document.createElement('span');
      sp.textContent = `${u.username} (${u.email})`;

      item.appendChild(av);
      item.appendChild(sp);
      results.appendChild(item);
    }
    if (users.length === 0) results.innerHTML = '<div style="padding:10px;color:var(--text-muted)">Не найдено</div>';
  },

  async startDM(userId) {
    const conv = await api('/api/conversations/dm', { method: 'POST', body: JSON.stringify({ userId }) });
    Chat.closeModal();
    await Chat.loadConversations();
    Chat.openConversation(conv.id);
  },

  _groupMembers: [],

  async searchGroupUsers(q) {
    if (!q) { $('#group-results').innerHTML = ''; return; }
    const users = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
    const results = $('#group-results');
    results.innerHTML = '';
    for (const u of users) {
      if (Chat._groupMembers.find(m => m.id === u.id)) continue;
      const item = document.createElement('div');
      item.className = 'user-result';
      item.onclick = () => { Chat._groupMembers.push(u); Chat.renderGroupMembers(); $('#group-search').value = ''; results.innerHTML = ''; };

      const av = document.createElement('div');
      av.className = 'conv-avatar';
      av.style.cssText = `background:${u.avatar_color};width:36px;height:36px;font-size:14px`;
      av.textContent = initials(u.username);

      const sp = document.createElement('span');
      sp.textContent = u.username;

      item.appendChild(av);
      item.appendChild(sp);
      results.appendChild(item);
    }
  },

  renderGroupMembers() {
    const el = $('#group-members');
    el.innerHTML = '';
    for (const m of Chat._groupMembers) {
      const chip = document.createElement('span');
      chip.className = 'member-chip';
      chip.textContent = m.username + ' ';
      const btn = document.createElement('button');
      btn.textContent = '✕';
      btn.onclick = () => { Chat._groupMembers = Chat._groupMembers.filter(x => x.id !== m.id); Chat.renderGroupMembers(); };
      chip.appendChild(btn);
      el.appendChild(chip);
    }
  },

  async createGroup() {
    const name = $('#group-name').value.trim();
    if (!name) return;
    const memberIds = Chat._groupMembers.map(m => m.id);
    await api('/api/conversations/group', { method: 'POST', body: JSON.stringify({ name, memberIds }) });
    Chat._groupMembers = [];
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
