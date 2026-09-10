import axios from 'axios';

const api = axios.create({ baseURL: '/api/v1' });

// Attach access token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, try refresh once then redirect to login
let refreshing = false;
let queue = [];

api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      if (refreshing) {
        return new Promise((resolve, reject) => {
          queue.push({ resolve, reject });
        }).then(() => api(original));
      }
      original._retry = true;
      refreshing = true;
      try {
        const refresh = localStorage.getItem('refresh_token');
        if (!refresh) throw new Error('No refresh token');
        const { data } = await axios.post('/api/v1/auth/refresh', { refresh_token: refresh });
        localStorage.setItem('access_token', data.data.access_token);
        queue.forEach(p => p.resolve());
        queue = [];
        return api(original);
      } catch (refreshErr) {
        queue.forEach(p => p.reject(refreshErr));
        queue = [];
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshErr);
      } finally {
        refreshing = false;
      }
    }
    return Promise.reject(err);
  }
);

export default api;
