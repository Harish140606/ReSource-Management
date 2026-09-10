import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DeclarationForm from './pages/DeclarationForm.jsx';
import DeclarationDetail from './pages/DeclarationDetail.jsx';
import Submissions from './pages/Submissions.jsx';
import VendorLog from './pages/VendorLog.jsx';
import DisposalLog from './pages/DisposalLog.jsx';
import LiveExcel from './pages/LiveExcel.jsx';
import Admin from './pages/Admin.jsx';
import Documents from './pages/Documents.jsx';
import { hasMinRole } from './constants/roles.js';

function RequireAuth({ children, minRole, roles }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (minRole && !hasMinRole(user.role, minRole)) return <Navigate to="/dashboard" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/declaration/new" element={<RequireAuth><DeclarationForm /></RequireAuth>} />
      <Route path="/declaration/:id/edit" element={<RequireAuth><DeclarationForm /></RequireAuth>} />
      <Route path="/declaration/:id" element={<RequireAuth><DeclarationDetail /></RequireAuth>} />
      <Route path="/submissions" element={<RequireAuth><Submissions /></RequireAuth>} />
      <Route path="/vendor-log" element={<RequireAuth><VendorLog /></RequireAuth>} />
      <Route path="/disposal-log" element={<RequireAuth roles={['SECURITY', 'IREP', 'ADMIN']}><DisposalLog /></RequireAuth>} />
      <Route path="/live-excel" element={<RequireAuth minRole="FACILITY_MANAGER"><LiveExcel /></RequireAuth>} />
      <Route path="/documents" element={<RequireAuth><Documents /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth minRole="ADMIN"><Admin /></RequireAuth>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
