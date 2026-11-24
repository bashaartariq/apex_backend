import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  template: `
    <div *ngIf="isOpen" class="modal-backdrop-custom" (click)="onCancel()" aria-hidden="true"></div>
    <div
      *ngIf="isOpen"
      class="modal-dialog-custom"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="'modal-title-' + id"
    >
      <div class="confirm-card shadow-lg">
        <div class="d-flex align-items-start gap-3 p-4">
          <div
            class="icon-circle flex-shrink-0"
            [ngClass]="isDestructive ? 'bg-danger-subtle text-danger' : 'bg-primary-subtle text-primary'"
          >
            <i
              class="bi fs-5"
              [ngClass]="isDestructive ? 'bi-exclamation-triangle-fill' : 'bi-shield-check'"
              aria-hidden="true"
            ></i>
          </div>
          <div class="flex-grow-1">
            <h2 [id]="'modal-title-' + id" class="h6 fw-bold mb-1">{{ title }}</h2>
            <div class="text-secondary small lh-base">{{ message }}</div>
          </div>
        </div>

        <div class="confirm-footer d-flex align-items-center justify-content-end gap-2 px-4 py-3">
          <button type="button" class="btn-app btn-app-secondary btn-app-sm" (click)="onCancel()">
            {{ cancelText }}
          </button>
          <button
            type="button"
            class="btn-app btn-app-sm"
            [ngClass]="isDestructive ? 'btn-app-danger' : 'btn-app-primary'"
            (click)="onConfirm()"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .modal-backdrop-custom {
        position: fixed;
        inset: 0;
        background-color: rgba(9, 13, 22, 0.56);
        backdrop-filter: blur(4px);
        z-index: 1080;
        animation: fadeIn 0.16s ease-out;
      }
      .modal-dialog-custom {
        position: fixed;
        inset-block-start: 50%;
        inset-inline-start: 50%;
        transform: translate(-50%, -50%);
        inline-size: 440px;
        max-inline-size: 92vw;
        z-index: 1085;
      }
      .confirm-card {
        background-color: var(--ms-bg-surface);
        color: var(--ms-text-primary);
        border: 1px solid var(--ms-border-strong);
        border-radius: var(--ms-radius-xl);
        overflow: hidden;
        animation: msModalPop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .confirm-footer {
        background-color: var(--ms-bg-subtle);
        border-top: 1px solid var(--ms-border-subtle);
      }
      .icon-circle {
        inline-size: 2.75rem;
        block-size: 2.75rem;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `,
  ],
})
export class ConfirmDialogComponent {
  @Input() id = 'dialog';
  @Input() isOpen = false;
  @Input() title = 'Confirm Action';
  @Input() message = 'Are you sure you want to proceed?';
  @Input() confirmText = 'Confirm';
  @Input() cancelText = 'Cancel';
  @Input() isDestructive = false;

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  @HostListener('window:keydown.escape')
  handleEscape(): void {
    if (this.isOpen) {
      this.onCancel();
    }
  }

  onConfirm(): void {
    this.confirm.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
