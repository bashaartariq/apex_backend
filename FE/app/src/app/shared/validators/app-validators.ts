import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isValidCnic, isValidPhone, isValidEmail } from '../utils/formatters';

export class AppValidators {
  /**
   * Validates Pakistan CNIC (13 digits: XXXXX-XXXXXXX-X). Optional if empty.
   */
  static cnic(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value || String(value).trim() === '') {
      return null;
    }
    return isValidCnic(String(value)) ? null : { invalidCnic: 'Please enter a valid 13-digit CNIC number.' };
  }

  /**
   * Mandatory CNIC validator (must be present and valid 13 digits).
   */
  static requiredCnic(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value || String(value).trim() === '') {
      return { required: 'CNIC number is required.' };
    }
    return isValidCnic(String(value)) ? null : { invalidCnic: 'Please enter a valid 13-digit CNIC number.' };
  }

  /**
   * Validates phone number format. Optional if empty.
   */
  static phone(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value || String(value).trim() === '') {
      return null;
    }
    return isValidPhone(String(value)) ? null : { invalidPhone: 'Please enter a valid phone number.' };
  }

  /**
   * Mandatory phone number validator.
   */
  static requiredPhone(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value || String(value).trim() === '') {
      return { required: 'Phone number is required.' };
    }
    return isValidPhone(String(value)) ? null : { invalidPhone: 'Please enter a valid phone number.' };
  }

  /**
   * Validates email format. Optional if empty.
   */
  static email(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value || String(value).trim() === '') {
      return null;
    }
    return isValidEmail(String(value)) ? null : { invalidEmail: 'Please enter a valid email address.' };
  }

  /**
   * Validates non-negative numbers (>= 0).
   */
  static nonNegative(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    if (isNaN(num) || num < 0) {
      return { nonNegative: 'Value cannot be negative.' };
    }
    return null;
  }

  /**
   * Validates strictly positive numbers (> 0).
   */
  static positive(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    if (isNaN(num) || num <= 0) {
      return { positive: 'Value must be greater than zero.' };
    }
    return null;
  }

  /**
   * Validates percentage (0 to 100).
   */
  static percentage(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    if (isNaN(num) || num < 0 || num > 100) {
      return { percentage: 'Percentage must be between 0% and 100%.' };
    }
    return null;
  }

  /**
   * Validates battery health (0 to 100).
   */
  static batteryHealth(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const num = Number(value);
    if (isNaN(num) || num < 0 || num > 100) {
      return { batteryHealth: 'Battery health must be between 0 and 100.' };
    }
    return null;
  }
}
