import { STATUS_ORDER, STATUS_LABELS } from '../constants/statusFlow.js';
import { formatDateTime } from '../utils/dateHelpers.js';

const stepConfig = [
  { status: 'SUBMITTED', label: 'Declared', key: 'employee', tsKey: 'created_at' },
  { status: 'DEPT_APPROVED', label: 'Dept Approved', key: 'dept_head', tsKey: 'dept_approved_at' },
  { status: 'IREP_AUTHORIZED', label: 'IREP Auth', key: 'irep_authorizer', tsKey: 'irep_authorized_at' },
  { status: 'COMPLETED', label: 'Security · Completed', key: 'security_authorizer', tsKey: 'completed_at' },
];

export default function ApprovalChain({ declaration }) {
  if (!declaration) return null;
  const currentIdx = STATUS_ORDER.indexOf(declaration.status);

  return (
    <div className="flex items-start gap-0 overflow-x-auto pb-2">
      {stepConfig.map((step, i) => {
        const stepIdx = STATUS_ORDER.indexOf(step.status);
        const isDone = currentIdx >= stepIdx;
        const isCurrent = currentIdx === stepIdx - 1;
        const person = step.key ? declaration[step.key] : null;
        const ts = declaration[step.tsKey];

        return (
          <div key={step.status} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                isDone ? 'bg-brand-primary border-brand-primary text-white' : 'bg-white border-gray-300 text-gray-400'
              }`}>
                {isDone ? '✓' : i + 1}
              </div>
              <p className={`text-xs mt-1 font-medium text-center w-20 ${isDone ? 'text-brand-primary' : 'text-gray-400'}`}>
                {step.label}
              </p>
              {person && isDone && (
                <p className="text-xs text-gray-500 text-center w-20">{person.name}</p>
              )}
              {ts && isDone && (
                <p className="text-xs text-gray-400 text-center w-20">{formatDateTime(ts)}</p>
              )}
            </div>
            {i < stepConfig.length - 1 && (
              <div className={`h-0.5 w-8 mx-1 mt-[-12px] ${isDone && currentIdx > stepIdx ? 'bg-brand-primary' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
