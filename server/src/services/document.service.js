import prisma from '../utils/prisma.js';
import { AppError } from '../utils/AppError.js';
import { logAudit } from './audit.service.js';

export async function uploadDocument({ title, category, file }, user) {
  const doc = await prisma.document.create({
    data: {
      title: title?.trim() || file.originalname,
      category: category?.trim() || null,
      filename: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
      file_data: file.buffer,
      uploaded_by: user.id,
    },
    select: { id: true, title: true, category: true, filename: true, mime_type: true, size_bytes: true, created_at: true },
  });

  await logAudit({
    userId: user.id,
    action: 'DOCUMENT_UPLOADED',
    entity: 'documents',
    entityId: doc.id,
    newValue: { title: doc.title, filename: doc.filename },
  });

  return doc;
}

export async function listDocuments(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, parseInt(query.limit) || 20);
  const search = query.search || '';

  const where = search
    ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { filename: { contains: search, mode: 'insensitive' } }] }
    : {};

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      select: {
        id: true, title: true, category: true, filename: true, mime_type: true, size_bytes: true, created_at: true,
        uploader: { select: { name: true, emp_no: true } },
      },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.document.count({ where }),
  ]);

  return { documents, total, page, limit, pages: Math.ceil(total / limit) };
}

export async function getDocumentFile(id) {
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw new AppError('Document not found', 404, 'NOT_FOUND');
  return doc;
}

export async function deleteDocument(id, user) {
  if (user.role !== 'ADMIN') {
    throw new AppError('Only an Admin can delete a document', 403, 'FORBIDDEN');
  }
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw new AppError('Document not found', 404, 'NOT_FOUND');

  await prisma.document.delete({ where: { id } });
  await logAudit({
    userId: user.id,
    action: 'DOCUMENT_DELETED',
    entity: 'documents',
    entityId: id,
    oldValue: { title: doc.title, filename: doc.filename },
  });

  return { id };
}
