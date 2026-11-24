/**
 * Formatters and Normalizers for Application-Wide Data Consistency.
 */

/**
 * Normalizes and formats Pakistan CNIC numbers: XXXXX-XXXXXXX-X (13 digits)
 * Handles raw digits, partially typed digits, or pasted strings with hyphens.
 */
export function formatCnic(value: string | null | undefined): string {
  if (!value) return '';
  // If the value contains privacy masking asterisks, preserve it as-is
  if (value.includes('*')) return value.trim();

  // Extract numeric digits only
  const digits = value.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) {
    return digits;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12, 13)}`;
}

/**
 * Extracts raw 13 digits from a CNIC string (removes hyphens and whitespace).
 */
export function cleanCnic(value: string | null | undefined): string {
  if (!value) return '';
  if (value.includes('*')) return value.trim();
  return value.replace(/\D/g, '').slice(0, 13);
}

/**
 * Validates whether a given CNIC represents a valid 13-digit Pakistani CNIC.
 */
export function isValidCnic(value: string | null | undefined): boolean {
  if (!value) return false;
  if (value.includes('*')) return true; // Masked representation of existing valid record
  const digits = value.replace(/\D/g, '');
  return digits.length === 13;
}

/**
 * Formats phone numbers.
 * Supports Pakistani mobile (03XX-XXXXXXX), Pakistani landlines, and international numbers (+...).
 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return '';
  const trimmed = value.trim();

  // If already starts with +, preserve international prefix and format cleanly
  if (trimmed.startsWith('+')) {
    const cleaned = '+' + trimmed.slice(1).replace(/[^\d\s\-()]/g, '');
    return cleaned;
  }

  // Pakistan local mobile format: 03XXXXXXXXX (11 digits) -> 03XX-XXXXXXX
  const digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('03') && digits.length <= 11) {
    if (digits.length <= 4) {
      return digits;
    }
    return `${digits.slice(0, 4)}-${digits.slice(4, 11)}`;
  }

  // If starts with 92 and has 12 digits: +92-3XX-XXXXXXX
  if (digits.startsWith('92') && digits.length === 12) {
    return `+92-${digits.slice(2, 5)}-${digits.slice(5, 12)}`;
  }

  return trimmed;
}

/**
 * Validates phone numbers.
 * Accepts between 7 and 20 characters matching phone characters: digits, spaces, hyphens, plus, parentheses.
 */
export function isValidPhone(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false;
  const trimmed = value.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  // Must have at least 7 digits and at most 16 digits
  if (digitsOnly.length < 7 || digitsOnly.length > 16) return false;
  return /^[0-9+\s\-()]{7,20}$/.test(trimmed);
}

/**
 * Validates standard email address format.
 */
export function isValidEmail(value: string | null | undefined): boolean {
  if (!value || !value.trim()) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Formats numbers into currency format (two decimal places).
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '$0.00';
  return '$' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
