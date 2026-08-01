function calendarParts(date: Date, timeZone?: string) {
  if (!timeZone) {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
    };
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value('year'), month: value('month'), day: value('day') };
}

export function localCalendarDate(date = new Date(), timeZone?: string) {
  const { year, month, day } = calendarParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function timeGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return '夜深了';
  if (hour < 12) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export function readableLocalUpdate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '更新时间未知';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日更新`;
}
