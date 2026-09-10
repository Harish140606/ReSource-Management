import { useState } from 'react';
import Navbar from './Navbar.jsx';
import Sidebar from './Sidebar.jsx';

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0A1C1F 0%, #0C3B40 40%, #0E4A45 70%, #10402E 100%)' }}
    >
      <Navbar onMenuToggle={() => setSidebarOpen(o => !o)} />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 relative">
          {/* Decorative glow blobs */}
          <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <div style={{
              position: 'absolute', top: '-8%', left: '-6%',
              width: '600px', height: '600px', borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0,80,255,0.22) 0%, transparent 65%)',
              filter: 'blur(50px)',
            }} />
            <div style={{
              position: 'absolute', bottom: '-10%', right: '-5%',
              width: '700px', height: '700px', borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0,204,68,0.18) 0%, transparent 65%)',
              filter: 'blur(60px)',
            }} />
            <div style={{
              position: 'absolute', top: '35%', left: '38%',
              width: '500px', height: '500px', borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(0,170,204,0.10) 0%, transparent 65%)',
              filter: 'blur(70px)',
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }} />
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
