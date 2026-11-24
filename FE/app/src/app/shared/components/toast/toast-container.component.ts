import { Component, OnInit } from '@angular/core';
import { ToastMessage, ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  template: `
    <div class="toast-stack position-fixed bottom-0 end-0 p-3" style="z-index: 1090;">
      <div
        *ngFor="let toast of toasts"
        class="toast-item shadow-lg d-flex align-items-start gap-2"
        [ngClass]="'toast-' + toast.type"
        role="alert"
        aria-live="polite"
      >
        <div class="toast-icon-wrap flex-shrink-0" [ngClass]="'icon-' + toast.type">
          <i *ngIf="toast.type === 'success'" class="bi bi-check-lg"></i>
          <i *ngIf="toast.type === 'danger'" class="bi bi-x-lg"></i>
          <i *ngIf="toast.type === 'warning'" class="bi bi-exclamation-lg"></i>
          <i *ngIf="toast.type === 'info'" class="bi bi-info-lg"></i>
        </div>

        <div class="toast-body-content flex-grow-1 overflow-hidden">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-0.5">
            <strong class="small fw-bold text-truncate">{{ toast.title }}</strong>
            <button
              type="button"
              class="btn-close"
              style="font-size: 0.62rem;"
              aria-label="Close notification"
              (click)="dismiss(toast.id)"
            ></button>
          </div>
          <div class="text-secondary small lh-sm">{{ toast.message }}</div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .toast-stack {
        max-inline-size: 390px;
        inline-size: 100%;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
      }
      .toast-item {
        pointer-events: auto;
        padding: 0.8rem 0.95rem;
        border-radius: var(--ms-radius-md);
        background-color: var(--ms-bg-surface);
        color: var(--ms-text-primary);
        border: 1px solid var(--ms-border-strong);
        border-inline-start: 4px solid var(--ms-brand-primary);
        animation: slideUp 0.24s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .toast-success { border-inline-start-color: var(--ms-success); }
      .toast-danger { border-inline-start-color: var(--ms-danger); }
      .toast-warning { border-inline-start-color: var(--ms-warning); }
      .toast-info { border-inline-start-color: var(--ms-info); }
      .toast-icon-wrap {
        inline-size: 1.75rem;
        block-size: 1.75rem;
        border-radius: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.95rem;
        margin-top: 1px;
      }
      .icon-success { background: var(--ms-success-subtle); color: var(--ms-success); }
      .icon-danger { background: var(--ms-danger-subtle); color: var(--ms-danger); }
      .icon-warning { background: var(--ms-warning-subtle); color: var(--ms-warning); }
      .icon-info { background: var(--ms-info-subtle); color: var(--ms-info); }
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(12px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
    `,
  ],
})
export class ToastContainerComponent implements OnInit {
  toasts: ToastMessage[] = [];

  constructor(private readonly toastService: ToastService) {}

  ngOnInit(): void {
    this.toastService.toasts$.subscribe((toasts) => {
      this.toasts = toasts;
    });
  }

  dismiss(id: string): void {
    this.toastService.dismiss(id);
  }
}
