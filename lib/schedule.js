/** Client-side preview of the SQL next_contribution_due() helper. */
export function nextDueDate(frequency, dom, dow, from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  if (frequency === 'monthly') {
    const day = Math.min(28, Math.max(1, Number(dom) || 1));
    const candidate = new Date(d.getFullYear(), d.getMonth(), day);
    if (candidate < d) candidate.setMonth(candidate.getMonth() + 1);
    return candidate;
  }
  const target = ((Number(dow) || 0) % 7 + 7) % 7;
  d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
  return d;
}

export const WEEKDAYS = [
  { value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' }, { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];
