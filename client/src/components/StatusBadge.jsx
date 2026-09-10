import { STATUS_LABELS } from '../constants/statusFlow.js';

const STATUS_STYLES = {
  DRAFT:               'bg-gray-100 text-gray-600 border-gray-200',
  SUBMITTED:           'bg-blue-50 text-blue-700 border-blue-200',
  DEPT_APPROVED:       'bg-cyan-50 text-cyan-700 border-cyan-200',
  IREP_AUTHORIZED:     'bg-indigo-50 text-indigo-700 border-indigo-200',
  COMPLETED:           'bg-green-50 text-green-700 border-green-200',
  REJECTED:            'bg-red-50 text-red-700 border-red-200',
};

const STATUS_DOTS = {
  DRAFT:               'bg-gray-400',
  SUBMITTED:           'bg-blue-500',
  DEPT_APPROVED:       'bg-cyan-500',
  IREP_AUTHORIZED:     'bg-indigo-500',
  COMPLETED:           'bg-green-500',
  REJECTED:            'bg-red-500',
};

export default function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOTS[status] || 'bg-gray-400'}`} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}
