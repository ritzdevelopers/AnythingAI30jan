/**
 * Simple realtime date/time lookup (server clock).
 */

export type TimeData = {
  timezone: string;
  iso: string;
  date: string;
  time: string;
};

const TIME_KEYWORDS = /\b(time|date|day|today|now|current)\b/i;

export function getTimeData(message: string): TimeData | null {
  if (!TIME_KEYWORDS.test(message)) return null;
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const date = now.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: '2-digit',
  });
  const time = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  return {
    timezone,
    iso: now.toISOString(),
    date,
    time,
  };
}

export function getTimeContext(message: string): string | null {
  const data = getTimeData(message);
  if (!data) return null;
  return `Realtime date/time data:\nDate: ${data.date}\nTime: ${data.time}\nTimezone: ${data.timezone}\nISO: ${data.iso}`;
}
