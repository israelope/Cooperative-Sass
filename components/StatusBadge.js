const MAP = {
  active: 'badge-ok', success: 'badge-ok', repaid: 'badge-ok',
  pending: 'badge-warn', requested: 'badge-warn', approved: 'badge-info', unclaimed: 'badge-info',
  suspended: 'badge-bad', failed: 'badge-bad', rejected: 'badge-bad',
};
export default function StatusBadge({ status }) {
  return <span className={MAP[status] || 'badge-info'}>{status}</span>;
}
