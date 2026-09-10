import api from './api.js';

export const SETTING_KEYS = {
  EXCEL_DECLARATION_UPLOAD: 'excel_declaration_upload_enabled',
};

export const getSetting = (key) =>
  api.get(`/settings/${key}`).then(r => r.data.data.value);

export const updateSetting = (key, value) =>
  api.patch(`/settings/${key}`, { value }).then(r => r.data.data.value);
