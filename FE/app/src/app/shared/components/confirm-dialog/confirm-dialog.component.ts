import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-confirm-dialog',
  template: `
    <div *ngIf="isOpen" class="modal-backdrop-custom" (click)="onCancel()" aria-hidden="true"></div>
    <div *ngIf="isOpen" class="modal-dialog-custom" role="dialog" aria-modal="true" [attr.aria-labelledby]="'modal-title-' + id">
      <div class="modal-content shadow-lg border rounded p-4 bg-white">
        <div class="d-flex align-items-center gap-3 mb-3">
          <div class="icon-circle flex-shrink-0" [ngClass]="isDestructive ? 'bg-danger-subtle text-danger' : 'bg-primary-subtle text-primary'">
            <i class="bi" [ngClass]="isDestructive ? 'bi-exclamation-triangle-fill' : 'bi-question-circle-fill'" fs-4></i>
          </div>
          <div>
            <h2 [id]="'modal-title-' + id" class="h6 fw-bold mb-1 text-dark">{{ title }}</h2>
            <div class="text-secondary small">{{ message }}</div>
          </div>
        </div>

        <div class="d-flex align-items-center justify-content-end gap-2 mt-3 pt-3 border-top">
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
        background-color: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(2px);
        z-index: 1080;
      }
      .modal-dialog-custom {
        position: fixed;
        inset-block-start: 50%;
        inset-inline-start: 50%;
        transform: translate(-50%, -50%);
        inline-size: 420px;
        max-inline-size: 92vw;
        z-index: 1085;
      }
      .icon-circle {
        inline-size: 2.75rem;
        block-size: 2.75rem;
        border-radius: 50%;
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

  onConfirm(): void {
    this.confirm.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
