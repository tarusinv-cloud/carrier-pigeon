const Auth = {
  isRegister: false,

  init() {
    $('#toggle-auth').addEventListener('click', (e) => {
      e.preventDefault();
      Auth.isRegister = !Auth.isRegister;
      Auth.updateUI();
    });
    $('#auth-form').addEventListener('submit', (e) => {
      e.preventDefault();
      Auth.submit();
    });
    Auth.updateUI();
  },

  updateUI() {
    const usernameEl = $('#auth-username');
    const btn = $('#auth-btn');
    const toggle = $('#toggle-auth');
    if (Auth.isRegister) {
      usernameEl.style.display = '';
      usernameEl.required = true;
      btn.textContent = 'Sign Up';
      toggle.textContent = 'Log In';
      toggle.parentElement.firstChild.textContent = 'Already have an account? ';
    } else {
      usernameEl.style.display = 'none';
      usernameEl.required = false;
      btn.textContent = 'Log In';
      toggle.textContent = 'Sign Up';
      toggle.parentElement.firstChild.textContent = "Don't have an account? ";
    }
    $('#auth-error').textContent = '';
  },

  async submit() {
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    const username = $('#auth-username').value.trim();
    const errorEl = $('#auth-error');
    errorEl.textContent = '';

    try {
      const endpoint = Auth.isRegister ? '/api/auth/register' : '/api/auth/login';
      const body = Auth.isRegister ? { email, password, username } : { email, password };
      const data = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      App.currentUser = data.user;
      App.showChat();
    } catch (err) {
      errorEl.textContent = err.message;
    }
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    App.currentUser = null;
    Chat.disconnect();
    $('#auth-screen').style.display = 'flex';
    $('#chat-screen').style.display = 'none';
  }
};
