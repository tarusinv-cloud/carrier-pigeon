const API = '';

async function api(path, opts = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...opts.headers } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
  const now = Date.now();
  const diff = (now - d.getTime()) / 1000;
  if (diff < 60) return 'сейчас';
  if (diff < 3600) return Math.floor(diff / 60) + ' мин';
  if (diff < 86400) return Math.floor(diff / 3600) + ' ч';
  if (diff < 604800) return Math.floor(diff / 86400) + ' д';
  return d.toLocaleDateString('ru-RU');
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { month: 'long', day: 'numeric', year: 'numeric' });
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
