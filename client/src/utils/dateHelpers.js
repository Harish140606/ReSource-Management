import dayjs from 'dayjs';

export const formatDate = (d) => d ? dayjs(d).format('DD MMM YYYY') : '—';
export const formatDateTime = (d) => d ? dayjs(d).format('DD MMM YYYY HH:mm') : '—';
export const formatDateInput = (d) => d ? dayjs(d).format('YYYY-MM-DD') : '';
export const today = () => dayjs().format('YYYY-MM-DD');
export const weekAgo = () => dayjs().subtract(6, 'day').format('YYYY-MM-DD');
