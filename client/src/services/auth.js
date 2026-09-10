import api from './api.js';

export async function login(emp_no, password) {
  const { data } = await api.post('/auth/login', { emp_no, password });
  const { access_token, refresh_token, user } = data.data;
  localStorage.setItem('access_token', access_token);
  localStorage.setItem('refresh_token', refresh_token);
  localStorage.setItem('user', JSON.stringify(user));
  return user;
}

export async function logout() {
  try { await api.post('/auth/logout'); } catch (_) {}
  localStorage.clear();
}

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; }
}

export function isAuthenticated() {
  return !!localStorage.getItem('access_token');
}
