const BRASILIA_UTC_OFFSET_HOURS = 3;

type ParsedDate = {
  year: number;
  month: number;
  day: number;
};

function parseDateOnly(value: string): ParsedDate {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error(`Data invalida: ${value}`);
  }
  return { year, month, day };
}

export function buildBrasiliaDateRange(dataInicio?: string, dataFim?: string) {
  const range: { gte?: Date; lte?: Date } = {};

  if (dataInicio) {
    const { year, month, day } = parseDateOnly(dataInicio);
    range.gte = new Date(Date.UTC(year, month - 1, day, BRASILIA_UTC_OFFSET_HOURS, 0, 0, 0));
  }

  if (dataFim) {
    const { year, month, day } = parseDateOnly(dataFim);
    range.lte = new Date(Date.UTC(year, month - 1, day + 1, BRASILIA_UTC_OFFSET_HOURS - 1, 59, 59, 999));
  }

  return Object.keys(range).length > 0 ? range : undefined;
}

export function toBrasiliaDateKey(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getTime() - BRASILIA_UTC_OFFSET_HOURS * 60 * 60 * 1000).toISOString().slice(0, 10);
}
