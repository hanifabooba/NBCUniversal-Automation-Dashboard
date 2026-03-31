import { WorkingWeekRange } from './weekly-status.models';

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatWeekLabel(monday: Date, friday: Date): string {
  const sameYear = monday.getFullYear() === friday.getFullYear();
  const sameMonth = sameYear && monday.getMonth() === friday.getMonth();

  if (sameMonth) {
    const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(monday);
    return `${month} ${monday.getDate()} - ${friday.getDate()}, ${monday.getFullYear()}`;
  }

  if (sameYear) {
    const start = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(monday);
    const end = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(friday);
    return `${start} - ${end}, ${monday.getFullYear()}`;
  }

  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt.format(monday)} - ${fmt.format(friday)}`;
}

export function getWorkingWeekRange(inputDate: Date): WorkingWeekRange {
  const date = new Date(inputDate);
  const day = date.getDay();
  const normalized = new Date(date);

  if (day === 6) {
    normalized.setDate(date.getDate() - 1);
  } else if (day === 0) {
    normalized.setDate(date.getDate() - 2);
  }

  const currentDay = normalized.getDay();
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

  const monday = new Date(normalized);
  monday.setDate(normalized.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  return {
    monday,
    friday,
    weekStart: formatDateOnly(monday),
    weekEnd: formatDateOnly(friday),
    label: formatWeekLabel(monday, friday)
  };
}

export function getWorkingWeekRangeFromInput(value?: string): WorkingWeekRange {
  if (value) {
    const parsed = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return getWorkingWeekRange(parsed);
    }
  }
  return getWorkingWeekRange(new Date());
}

export function formatPercent(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(2)}%`;
}

export function statusBadgeClass(status?: string): string {
  switch (String(status || '').toUpperCase()) {
    case 'SUCCESS':
      return 'text-bg-success';
    case 'FAILED':
      return 'text-bg-danger';
    case 'RUNNING':
      return 'text-bg-info';
    case 'QUEUED':
      return 'text-bg-secondary';
    default:
      return 'text-bg-light text-dark';
  }
}
