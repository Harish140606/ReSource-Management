export const BASE_URL = '/api/v1';

export const ENDPOINTS = {
  LOGIN: `${BASE_URL}/auth/login`,
  REFRESH: `${BASE_URL}/auth/refresh`,
  LOGOUT: `${BASE_URL}/auth/logout`,
  ME: `${BASE_URL}/employees/me`,
  EMPLOYEES: `${BASE_URL}/employees`,
  DECLARATIONS: `${BASE_URL}/declarations`,
  DECLARATIONS_NEXT_REFERENCE: `${BASE_URL}/declarations/next-reference`,
  DASHBOARD_SUMMARY: `${BASE_URL}/dashboard/summary`,
  DASHBOARD_LEDGER: `${BASE_URL}/dashboard/ledger`,
  DASHBOARD_TRENDS: `${BASE_URL}/dashboard/trends`,
  DASHBOARD_CIRCULARITY: `${BASE_URL}/dashboard/circularity`,
  VENDOR_PICKUPS: `${BASE_URL}/vendor-pickups`,
  LIVE_LEDGER: `${BASE_URL}/live/ledger`,
  LIVE_DECLARATIONS: `${BASE_URL}/live/declarations`,
  LIVE_SUMMARY: `${BASE_URL}/live/summary`,
  LIVE_VENDOR_PICKUPS: `${BASE_URL}/live/vendor-pickups`,
  ADMIN_EXPORT_LOG: `${BASE_URL}/admin/excel/export-log`,
  EXPORT_EXCEL: `${BASE_URL}/declarations/export/excel`,
};
