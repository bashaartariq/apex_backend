import { Component } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-reports',
  template: `
    <div class="container-fluid px-3 px-lg-4 py-4" style="max-inline-size: 1600px;">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle fw-semibold px-2 py-1">
              Store Analytics
            </span>
            <span class="text-muted small">&middot; Downtown Flagship Store #01</span>
          </div>
          <h1 class="h3 fw-bold text-dark mb-0">Financial &amp; Sales Reports</h1>
        </div>

        <button type="button" class="btn-app btn-app-secondary" (click)="exportPdf()">
          <i class="bi bi-file-earmark-arrow-down" aria-hidden="true"></i>
          <span>Export Store Statement (PDF)</span>
        </button>
      </div>

      <!-- KPI Executive Metrics Row -->
      <div class="row g-3 mb-4">
        <div class="col-12 col-sm-6 col-xl-3">
          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-label">Gross Margin</span>
              <div class="metric-icon-box bg-success-subtle text-success">
                <i class="bi bi-percent" aria-hidden="true"></i>
              </div>
            </div>
            <div class="metric-value text-success font-monospace">31.8%</div>
            <div class="metric-footer">
              <span class="text-muted">Target: &gt;28%</span>
            </div>
          </div>
        </div>

        <div class="col-12 col-sm-6 col-xl-3">
          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-label">Average Order Value (AOV)</span>
              <div class="metric-icon-box bg-primary-subtle text-primary">
                <i class="bi bi-cart-check" aria-hidden="true"></i>
              </div>
            </div>
            <div class="metric-value font-monospace">$384.20</div>
            <div class="metric-footer">
              <span class="text-success fw-bold font-monospace">+8.1%</span>
              <span class="text-muted">vs last month</span>
            </div>
          </div>
        </div>

        <div class="col-12 col-sm-6 col-xl-3">
          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-label">Defect / Return Rate</span>
              <div class="metric-icon-box bg-info-subtle text-info">
                <i class="bi bi-shield-check" aria-hidden="true"></i>
              </div>
            </div>
            <div class="metric-value font-monospace">0.8%</div>
            <div class="metric-footer">
              <span class="text-success fw-semibold">Industry leading</span>
            </div>
          </div>
        </div>

        <div class="col-12 col-sm-6 col-xl-3">
          <div class="metric-card">
            <div class="metric-header">
              <span class="metric-label">Turnover Rate</span>
              <div class="metric-icon-box bg-purple-subtle text-purple">
                <i class="bi bi-arrow-repeat" aria-hidden="true"></i>
              </div>
            </div>
            <div class="metric-value font-monospace">18.4 Days</div>
            <div class="metric-footer">
              <span class="text-muted">Avg days in inventory</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Breakdown Cards -->
      <div class="row g-4 mb-4">
        <div class="col-12 col-lg-6">
          <section class="app-card h-100" aria-label="Tender Breakdown">
            <div class="app-card-header">
              <h2 class="app-card-title">
                <i class="bi bi-credit-card-2-front text-primary"></i>
                <span>Tender Breakdown by Payment Method</span>
              </h2>
            </div>
            <div class="app-card-body p-4">
              <div class="mb-4">
                <div class="d-flex justify-content-between small mb-1">
                  <span class="fw-semibold text-dark">Credit &amp; Debit Cards (Stripe / POS Terminal)</span>
                  <span class="font-monospace text-secondary">$9,485.12 (64%)</span>
                </div>
                <div class="progress" style="block-size: 8px;">
                  <div class="progress-bar bg-primary" style="inline-size: 64%;"></div>
                </div>
              </div>

              <div class="mb-4">
                <div class="d-flex justify-content-between small mb-1">
                  <span class="fw-semibold text-dark">Cash Tender</span>
                  <span class="font-monospace text-secondary">$4,149.74 (28%)</span>
                </div>
                <div class="progress" style="block-size: 8px;">
                  <div class="progress-bar bg-success" style="inline-size: 28%;"></div>
                </div>
              </div>

              <div class="mb-2">
                <div class="d-flex justify-content-between small mb-1">
                  <span class="fw-semibold text-dark">Bank Wire / Instant QR Transfer</span>
                  <span class="font-monospace text-secondary">$1,185.64 (8%)</span>
                </div>
                <div class="progress" style="block-size: 8px;">
                  <div class="progress-bar bg-info" style="inline-size: 8%;"></div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div class="col-12 col-lg-6">
          <section class="app-card h-100" aria-label="Category Margins">
            <div class="app-card-header">
              <h2 class="app-card-title">
                <i class="bi bi-tags text-primary"></i>
                <span>Profitability by Product Category</span>
              </h2>
            </div>
            <div class="app-card-body p-4">
              <div class="p-3 mb-3 rounded bg-light border d-flex align-items-center justify-content-between">
                <div>
                  <strong class="text-dark d-block">Serialized Mobile Phones</strong>
                  <small class="text-muted">High volume &middot; Margin: 22.4%</small>
                </div>
                <div class="text-end font-monospace">
                  <div class="fw-bold text-dark">$11,240.50 Revenue</div>
                  <small class="text-success fw-bold">+$2,517.80 Profit</small>
                </div>
              </div>

              <div class="p-3 rounded bg-light border d-flex align-items-center justify-content-between">
                <div>
                  <strong class="text-dark d-block">Accessories &amp; Screen Protection</strong>
                  <small class="text-muted">High margin &middot; Margin: 61.2%</small>
                </div>
                <div class="text-end font-monospace">
                  <div class="fw-bold text-dark">$3,580.00 Revenue</div>
                  <small class="text-success fw-bold">+$2,192.20 Profit</small>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  `,
})
export class ReportsComponent {
  constructor(private readonly toast: ToastService) {}

  exportPdf(): void {
    this.toast.info('Export Report', 'Generated executive PDF statement for Downtown Flagship.');
  }
}
