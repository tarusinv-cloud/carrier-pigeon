const App = {
  currentUser: null,

  async init() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    Auth.init();

    const token = localStorage.getItem('token');
    if (token) {
      try {
        App.currentUser = await api('/api/auth/me');
        localStorage.setItem('user', JSON.stringify(App.currentUser));
        App.showApp();
      } catch {
        localStorage.removeItem('token');
      }
    }

    $('#btn-logout').addEventListener('click', Auth.logout);
    $('#btn-new-msg').addEventListener('click', () => Chat.showNewChatModal());
    $('#modal-close').addEventListener('click', () => Chat.closeModal());
    $('#modal-overlay').addEventListener('click', (e) => { if (e.target === e.currentTarget) Chat.closeModal(); });

    $('#message-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); Chat.sendMessage(); }
    });
    $('#btn-send').addEventListener('click', () => Chat.sendMessage());

    $('#message-input').addEventListener('input', () => Chat.emitTyping());
    $('#search-input').addEventListener('input', () => Chat.renderConversations());

    $('#btn-back').addEventListener('click', () => {
      App.showTab('chats');
      Chat.activeConvId = null;
      Chat.renderConversations();
    });
  },

  showApp() {
    $('#auth-screen').style.display = 'none';
    $('#app-screen').style.display = 'flex';
    // Set user avatar in header
    const u = App.currentUser;
    if (u) {
      $('#user-avatar').style.background = u.avatar_color;
      $('#user-avatar').textContent = initials(u.username);
    }
    Chat.connect();
    Chat.loadConversations();
  },

  showTab(name) {
    $$('.tab-view').forEach(t => t.classList.remove('active'));
    if (name === 'chats') {
      $('#tab-chats').classList.add('active');
      $('#bottom-nav').style.display = 'flex';
      $('#btn-new-msg').style.display = 'flex';
    } else if (name === 'chat-view') {
      $('#tab-chat-view').classList.add('active');
      $('#bottom-nav').style.display = 'none';
      $('#btn-new-msg').style.display = 'none';
    }
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
