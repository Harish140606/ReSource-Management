import prisma from '../utils/prisma.js';

export const SETTINGS = {
  EXCEL_DECLARATION_UPLOAD: 'excel_declaration_upload_enabled',
};

const DEFAULTS = {
  [SETTINGS.EXCEL_DECLARATION_UPLOAD]: false,
};

export async function getSetting(key) {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row ? row.value : DEFAULTS[key] ?? null;
}

export async function setSetting(key, value) {
  const row = await prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  return row.value;
}
