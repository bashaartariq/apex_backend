/**
 * RFC 4180 Compliant CSV Generator with Spreadsheet Formula Injection Defense
 */

export interface CsvColumn<T = any> {
  header: string;
  key?: keyof T;
  transform?: (row: T) => string | number | null | undefined;
}

/**
 * Sanitizes a value to prevent CSV Formula Injection (CWE-1236)
 * If cell text starts with '=', '+', '-', '@', '\t', '\r', prepends single quote "'"
 */
export function sanitizeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }

  let str = String(val);

  // Check for dangerous formula injection trigger characters
  const firstChar = str.charAt(0);
  if (['=', '+', '-', '@', '\t', '\r'].includes(firstChar)) {
    // If it's a negative number like -12.50, check if strictly numeric
    const isNegativeNumeric = /^-\d+(\.\d+)?$/.test(str);
    if (!isNegativeNumeric) {
      str = `'${str}`;
    }
  }

  // If contains commas, newlines, or quotes, wrap in quotes and escape internal quotes
  if (/[",\r\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function generateCsv<T>(data: T[], columns: CsvColumn<T>[]): string {
  const headerLine = columns.map((col) => sanitizeCsvCell(col.header)).join(',');
  const lines: string[] = [headerLine];

  for (const row of data) {
    const line = columns
      .map((col) => {
        let value: unknown;
        if (col.transform) {
          value = col.transform(row);
        } else if (col.key) {
          value = row[col.key];
        }
        return sanitizeCsvCell(value);
      })
      .join(',');
    lines.push(line);
  }

  return lines.join('\r\n');
}
