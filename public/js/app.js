const App = {
  currentUser: null,

  async init() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    Auth.init();

    // Check existing session
    const token = localStorage.getItem('token');
    if (token) {
      try {
        App.currentUser = await api('/api/auth/me');
        localStorage.setItem('user', JSON.stringify(App.currentUser));
        App.showChat();
      } catch {
        localStorage.removeItem('token');
      }
    }

    // Event listeners
    $('#btn-logout').addEventListener('click', Auth.logout);
    $('#btn-new-chat').addEventListener('click', () => Chat.showNewChatModal());
    $('#btn-new-group').addEventListener('click', () => Chat.showNewGroupModal());
    $('#modal-close').addEventListener('click', () => Chat.closeModal());
    $('#modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) Chat.closeModal(); });

    $('#message-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Chat.sendMessage(); }
    });
    $('#btn-send').addEventListener('click', () => Chat.sendMessage());

    let typingTimer;
    $('#message-input').addEventListener('input', () => {
      clearTimeout(typingTimer);
      Chat.emitTyping();
      typingTimer = setTimeout(() => {}, 2000);
    });

    $('#search-input').addEventListener('input', () => Chat.renderConversations());

    $('#btn-back').addEventListener('click', () => {
      $('#chat-main').classList.remove('show');
      Chat.activeConvId = null;
      Chat.renderConversations();
    });

    $('#btn-chat-info').addEventListener('click', () => {
      const conv = Chat.conversations.find(c => c.id === Chat.activeConvId);
      if (!conv) return;
      const members = conv.members || [];
      const html = members.map(m =>
        `<div class="user-result"><div class="conv-avatar" style="background:${m.avatar_color}">${initials(m.username)}</div><span>${escapeHtml(m.username)}${Chat.onlineUsers.has(m.id) ? ' <span class="online-dot"></span>' : ''}</span></div>`
      ).join('');
      Chat.showModal(Chat.convName(conv), html || 'No members');
    });
  },

  showChat() {
    $('#auth-screen').style.display = 'none';
    $('#chat-screen').style.display = 'flex';
    Chat.connect();
    Chat.loadConversations();
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
