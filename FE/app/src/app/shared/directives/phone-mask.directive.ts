import { Directive, ElementRef, HostListener, Optional } from '@angular/core';
import { NgControl } from '@angular/forms';
import { formatPhone } from '../utils/formatters';

@Directive({
  selector: '[appPhoneMask]',
})
export class PhoneMaskDirective {
  constructor(
    private readonly el: ElementRef<HTMLInputElement>,
    @Optional() private readonly ngControl: NgControl
  ) {}

  @HostListener('blur', ['$event'])
  onBlur(): void {
    const input = this.el.nativeElement;
    const rawValue = input.value;
    if (!rawValue) return;

    const formatted = formatPhone(rawValue);
    if (formatted !== rawValue) {
      input.value = formatted;
      if (this.ngControl?.control) {
        this.ngControl.control.setValue(formatted, { emitEvent: false });
      }
    }
  }

  @HostListener('input', ['$event'])
  onInput(): void {
    const input = this.el.nativeElement;
    const rawValue = input.value;
    if (!rawValue) return;

    // Fast inline format for standard 11-digit Pakistan mobile (03XX-XXXXXXX)
    const digits = rawValue.replace(/\D/g, '');
    if (rawValue.startsWith('03') && digits.length >= 5 && !rawValue.includes('-')) {
      const formatted = `${digits.slice(0, 4)}-${digits.slice(4, 11)}`;
      input.value = formatted;
      if (this.ngControl?.control) {
        this.ngControl.control.setValue(formatted, { emitEvent: false });
      }
    }
  }

  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const pastedText = clipboardData.getData('text');
    if (!pastedText) return;

    const formatted = formatPhone(pastedText);
    event.preventDefault();

    const input = this.el.nativeElement;
    input.value = formatted;
    if (this.ngControl?.control) {
      this.ngControl.control.setValue(formatted);
      this.ngControl.control.markAsDirty();
    }
  }
}
