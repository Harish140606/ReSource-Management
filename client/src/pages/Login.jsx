import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';

export default function Login() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [empNo, setEmpNo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await login(empNo.trim(), password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Invalid credentials. Please try again.');
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #00838F 0%, #00A7B5 50%, #7CB342 100%)' }}>

        {/* Background circles decoration */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-16 w-[500px] h-[500px] rounded-full bg-white/5" />
        <div className="absolute top-1/3 right-8 w-48 h-48 rounded-full bg-white/5" />

        <div className="relative z-10 text-center">
          <img src="/logo.svg" alt="ReSource Management" className="h-16 mx-auto mb-8 rounded-lg shadow-lg bg-white/95 px-4 py-2" />
          <h1 className="text-white text-3xl font-bold mb-3 tracking-tight">
            ReSource<br />Management
          </h1>
          <p className="text-white/70 text-base max-w-xs mx-auto leading-relaxed">
            End-to-end scrap declaration, approval workflow, and real-time waste analytics for manufacturing operations.
          </p>

          {/* Feature pills */}
          <div className="mt-10 flex flex-wrap justify-center gap-2">
            {['Multi-stage approvals', 'Live Excel export', 'BAT & SOFT tracking', 'Audit logs'].map(f => (
              <span key={f} className="bg-white/15 text-white text-xs font-medium px-3 py-1.5 rounded-full border border-white/20">
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <img src="/logo.svg" alt="ReSource Management" className="h-10 mx-auto rounded-md shadow" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
            <div className="mb-7">
              <h2 className="text-xl font-bold text-gray-900">Welcome back</h2>
              <p className="text-sm text-brand-muted mt-1">Sign in with your employee credentials</p>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-5">
                <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="form-label">Employee Number</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. EMP001"
                  value={empNo}
                  onChange={e => setEmpNo(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="form-label">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="form-input pr-10"
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPass ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-2.5 text-base mt-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    Signing in…
                  </>
                ) : 'Sign In'}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Manufacturing Facility · Authorized personnel only
          </p>
        </div>
      </div>
    </div>
  );
}
