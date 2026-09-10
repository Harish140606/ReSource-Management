import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import authRoutes from './routes/auth.routes.js';
import employeeRoutes from './routes/employee.routes.js';
import declarationRoutes from './routes/declaration.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import vendorPickupRoutes from './routes/vendorPickup.routes.js';
import disposalInvoiceRoutes from './routes/disposalInvoice.routes.js';
import weighmentRoutes from './routes/weighment.routes.js';
import liveRoutes from './routes/live.routes.js';
import adminExcelRoutes from './routes/adminExcel.routes.js';
import adminRoutes from './routes/admin.routes.js';
import referenceDataRoutes from './routes/referenceData.routes.js';
import documentRoutes from './routes/document.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { registerNightlyExportJob } from './jobs/nightlyExport.job.js';
import { ensureReferenceData } from './bootstrap/ensureReferenceData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// CORS
app.use(cors({
  origin: (origin, cb) => {
    const allowed = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map(s => s.trim());
    // Allow requests with no origin (curl, Postman) and any listed origin
    if (!origin || allowed.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
      cb(null, true);
    } else {
      cb(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  credentials: true,
}));

// Rate limiting
app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many requests', code: 'RATE_LIMITED' } },
}));

app.use(express.json({ limit: '5mb' }));

// Power Query setup page (unauthenticated)
app.get('/powerquery-setup', (req, res) => {
  res.sendFile(join(__dirname, 'powerquery-setup.html'));
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/declarations', declarationRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/vendor-pickups', vendorPickupRoutes);
app.use('/api/v1/disposal-invoices', disposalInvoiceRoutes);
app.use('/api/v1/weighments', weighmentRoutes);
app.use('/api/v1/live', liveRoutes);
app.use('/api/v1/admin-excel', adminExcelRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/reference-data', referenceDataRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/settings', settingsRoutes);

// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } });
});

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, '../../client/dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });
} else {
  // 404 only in dev (in prod React router handles unknown paths)
  app.use((req, res) => {
    res.status(404).json({ success: false, error: { message: 'Route not found', code: 'NOT_FOUND' } });
  });
};

// Global error handler
app.use(errorHandler);

// Start
app.listen(PORT, () => {
  console.log(`[Server] ReSource Scrap API running on port ${PORT}`);
  registerNightlyExportJob();
  ensureReferenceData();
});

export default app;
