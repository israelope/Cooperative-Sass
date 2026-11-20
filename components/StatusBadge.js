import Icon from '@/components/Icon';

const MAP = {
  active: ['badge-ok', 'checkCircle'],
  success: ['badge-ok', 'checkCircle'],
  repaid: ['badge-ok', 'checkCircle'],
  pending: ['badge-warn', 'clock'],
  requested: ['badge-warn', 'clock'],
  approved: ['badge-info', 'check'],
  unclaimed: ['badge-info', 'mail'],
  suspended: ['badge-bad', 'lock'],
  failed: ['badge-bad', 'xCircle'],
  rejected: ['badge-bad', 'xCircle'],
};

export default function StatusBadge({ status }) {
  const [classes, icon] = MAP[status] || ['badge-info', 'info'];
  return <span className={classes}><Icon name={icon} size={12} />{status}</span>;
}
