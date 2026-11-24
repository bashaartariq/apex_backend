import { SqlPrimitive } from '../database/query';

export interface DateFilterResult {
  sql: string;
  params: SqlPrimitive[];
  rangeLabel: string;
  startDateIso?: string;
  endDateIso?: string;
}

/**
 * Resolves standard date range filters to SQLite parameterized SQL snippets.
 * Supports: today, yesterday, last7days, last30days, current_month, previous_month, current_year, or custom range.
 */
export function buildDateFilter(
  range: string | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  columnName = 'created_at'
): DateFilterResult {
  const normRange = (range || '').toLowerCase().trim();

  if (normRange === 'today') {
    return {
      sql: `date(${columnName}) = date('now')`,
      params: [],
      rangeLabel: "Today",
    };
  }

  if (normRange === 'yesterday') {
    return {
      sql: `date(${columnName}) = date('now', '-1 day')`,
      params: [],
      rangeLabel: 'Yesterday',
    };
  }

  if (normRange === 'last7days' || normRange === '7d') {
    return {
      sql: `date(${columnName}) >= date('now', '-7 days')`,
      params: [],
      rangeLabel: 'Last 7 Days',
    };
  }

  if (normRange === 'last30days' || normRange === '30d') {
    return {
      sql: `date(${columnName}) >= date('now', '-30 days')`,
      params: [],
      rangeLabel: 'Last 30 Days',
    };
  }

  if (normRange === 'current_month' || normRange === 'this_month') {
    return {
      sql: `strftime('%Y-%m', ${columnName}) = strftime('%Y-%m', 'now')`,
      params: [],
      rangeLabel: 'Current Month',
    };
  }

  if (normRange === 'previous_month' || normRange === 'last_month') {
    return {
      sql: `strftime('%Y-%m', ${columnName}) = strftime('%Y-%m', 'now', '-1 month')`,
      params: [],
      rangeLabel: 'Previous Month',
    };
  }

  if (normRange === 'current_year' || normRange === 'this_year') {
    return {
      sql: `strftime('%Y', ${columnName}) = strftime('%Y', 'now')`,
      params: [],
      rangeLabel: 'Current Year',
    };
  }

  // Custom dateFrom / dateTo
  const clauses: string[] = [];
  const params: SqlPrimitive[] = [];

  if (dateFrom && dateFrom.trim()) {
    clauses.push(`date(${columnName}) >= date(?)`);
    params.push(dateFrom.trim());
  }

  if (dateTo && dateTo.trim()) {
    clauses.push(`date(${columnName}) <= date(?)`);
    params.push(dateTo.trim());
  }

  if (clauses.length > 0) {
    return {
      sql: clauses.join(' AND '),
      params,
      rangeLabel: `${dateFrom || 'Start'} to ${dateTo || 'End'}`,
      startDateIso: dateFrom,
      endDateIso: dateTo,
    };
  }

  // Default: no date constraint
  return {
    sql: '1=1',
    params: [],
    rangeLabel: 'All Time',
  };
}
