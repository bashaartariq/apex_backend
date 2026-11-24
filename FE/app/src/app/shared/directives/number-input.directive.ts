import { Directive, ElementRef, HostListener, Input } from '@angular/core';

@Directive({
  selector: '[appNumberOnly]',
})
export class NumberOnlyDirective {
  @Input() allowDecimal = true;
  @Input() set allowDecimals(val: boolean) {
    this.allowDecimal = val;
  }
  @Input() allowNegative = false;

  constructor(private readonly el: ElementRef<HTMLInputElement>) {}

  @HostListener('keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const key = event.key;

    // Allow navigation and editing keys
    if (
      [
        'Backspace',
        'Tab',
        'End',
        'Home',
        'ArrowLeft',
        'ArrowRight',
        'Delete',
        'Escape',
        'Enter',
      ].includes(key) ||
      // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Cmd+A, etc.
      ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(key.toLowerCase()))
    ) {
      return;
    }

    // Allow decimal point if configured and not already present
    if (this.allowDecimal && (key === '.' || key === ',')) {
      if (!this.el.nativeElement.value.includes('.')) {
        return;
      }
    }

    // Allow negative sign if configured and at start
    if (this.allowNegative && key === '-') {
      if (this.el.nativeElement.selectionStart === 0 && !this.el.nativeElement.value.includes('-')) {
        return;
      }
    }

    // Check if key is a digit 0-9
    if (/^\d$/.test(key)) {
      return;
    }

    // Block all other keys
    event.preventDefault();
  }
}
