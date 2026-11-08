import { Component, Input } from '@angular/core';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'brand' | 'purple';

@Component({
  selector: 'app-status-badge',
  template: `
    <span class="status-pill" [ngClass]="'tone-' + tone">
      <span class="status-dot" aria-hidden="true"></span>
      <span>{{ label }}</span>
    </span>
  `,
  styles: [
    `
      .status-pill {
        display: inline-flex;
        align-items: safe center;
        gap: 0.4rem;
        padding-block: 0.25rem;
        padding-inline: 0.65rem;
        border-radius: 999px;
        font-size: 0.8125rem;
        font-weight: 600;
        line-height: 1.2;
        white-space: nowrap;
      }
      .status-dot {
        inline-size: 0.5rem;
        block-size: 0.5rem;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .tone-success {
        background-color: #dcfce7;
        color: #166534;
      }
      .tone-success .status-dot {
        background-color: #16a34a;
      }
      .tone-warning {
        background-color: #fef3c7;
        color: #92400e;
      }
      .tone-warning .status-dot {
        background-color: #d97706;
      }
      .tone-danger {
        background-color: #fee2e2;
        color: #991b1b;
      }
      .tone-danger .status-dot {
        background-color: #dc2626;
      }
      .tone-neutral {
        background-color: #f1f5f9;
        color: #475569;
        border: 1px solid #e2e8f0;
      }
      .tone-neutral .status-dot {
        background-color: #64748b;
      }
      .tone-info {
        background-color: #f0f9ff;
        color: #0369a1;
        border: 1px solid #bae6fd;
      }
      .tone-info .status-dot {
        background-color: #0284c7;
      }
      .tone-brand {
        background-color: #eff6ff;
        color: #1d4ed8;
        border: 1px solid #bfdbfe;
      }
      .tone-brand .status-dot {
        background-color: #2563eb;
      }
      .tone-purple {
        background-color: #f5f3ff;
        color: #6d28d9;
        border: 1px solid #ddd6fe;
      }
      .tone-purple .status-dot {
        background-color: #7c3aed;
      }
    `,
  ],
})
export class StatusBadgeComponent {
  @Input() label = '';
  @Input() tone: BadgeTone = 'neutral';
}
