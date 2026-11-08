import { Component, Input } from '@angular/core';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral';

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
        background-color: #e2e8f0;
        color: #334155;
      }
      .tone-neutral .status-dot {
        background-color: #64748b;
      }
    `,
  ],
})
export class StatusBadgeComponent {
  @Input() label = '';
  @Input() tone: BadgeTone = 'neutral';
}
