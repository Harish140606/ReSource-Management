import { useState, useEffect, createContext, useContext } from 'react';
import { login as loginService, logout as logoutService, getStoredUser } from '../services/auth.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function login(emp_no, password) {
    setLoading(true);
    setError(null);
    try {
      const u = await loginService(emp_no, password);
      setUser(u);
      return u;
    } catch (err) {
      const msg = err.response?.data?.error?.message || 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await logoutService();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
