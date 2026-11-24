import { Directive, ElementRef, HostListener, Optional } from '@angular/core';
import { NgControl } from '@angular/forms';
import { formatCnic } from '../utils/formatters';

@Directive({
  selector: '[appCnicMask]',
})
export class CnicMaskDirective {
  constructor(
    private readonly el: ElementRef<HTMLInputElement>,
    @Optional() private readonly ngControl: NgControl
  ) {}

  @HostListener('input', ['$event'])
  onInput(event: InputEvent): void {
    const input = this.el.nativeElement;
    const rawValue = input.value;
    if (!rawValue) return;

    // Preserve privacy masked strings
    if (rawValue.includes('*')) return;

    const formatted = formatCnic(rawValue);
    if (formatted !== rawValue) {
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

    // If pasted text contains digits, format appropriately
    const formatted = formatCnic(pastedText);
    event.preventDefault();

    const input = this.el.nativeElement;
    input.value = formatted;
    if (this.ngControl?.control) {
      this.ngControl.control.setValue(formatted);
      this.ngControl.control.markAsDirty();
    }
  }
}
