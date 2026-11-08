import { Component, OnInit } from '@angular/core';
import { ToastMessage, ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  template: `
    <div class="toast-stack position-fixed bottom-0 end-0 p-3" style="z-index: 1090;">
      <div
        *ngFor="let toast of toasts"
        class="toast-item shadow-lg border rounded p-3 mb-2 bg-white d-flex align-items-start gap-2"
        [ngClass]="'toast-' + toast.type"
        role="alert"
        aria-live="polite"
      >
        <div class="toast-icon-wrap flex-shrink-0 mt-1">
          <i *ngIf="toast.type === 'success'" class="bi bi-check-circle-fill text-success fs-5"></i>
          <i *ngIf="toast.type === 'danger'" class="bi bi-x-circle-fill text-danger fs-5"></i>
          <i *ngIf="toast.type === 'warning'" class="bi bi-exclamation-triangle-fill text-warning fs-5"></i>
          <i *ngIf="toast.type === 'info'" class="bi bi-info-circle-fill text-info fs-5"></i>
        </div>

        <div class="toast-body-content flex-grow-1">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <strong class="text-dark small fw-bold">{{ toast.title }}</strong>
            <button
              type="button"
              class="btn-close ms-2"
              style="font-size: 0.65rem;"
              aria-label="Close notification"
              (click)="dismiss(toast.id)"
            ></button>
          </div>
          <div class="text-secondary small">{{ toast.message }}</div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .toast-stack {
        max-inline-size: 380px;
        inline-size: 100%;
        pointer-events: none;
      }
      .toast-item {
        pointer-events: auto;
        border-inline-start-width: 4px !important;
        animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .toast-success {
        border-inline-start-color: var(--ms-success) !important;
      }
      .toast-danger {
        border-inline-start-color: var(--ms-danger) !important;
      }
      .toast-warning {
        border-inline-start-color: var(--ms-warning) !important;
      }
      .toast-info {
        border-inline-start-color: var(--ms-info) !important;
      }
      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
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
