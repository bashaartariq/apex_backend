import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-operations',
  template: `
    <div class="container-fluid px-3 px-lg-4 py-4" style="max-inline-size: 1400px;">
      <div class="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-4">
        <div>
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle fw-semibold px-2 py-1">
              Store Operations
            </span>
            <span class="text-muted small">&middot; Downtown Flagship #01</span>
          </div>
          <h1 class="h3 fw-bold text-dark mb-0">{{ pageTitle }}</h1>
        </div>

        <button type="button" class="btn-app btn-app-secondary" (click)="onAction()">
          <i class="bi bi-clock-history"></i>
          <span>Activity Log</span>
        </button>
      </div>

      <!-- Content based on mode -->
      <div *ngIf="mode === 'returns'" class="app-card mb-4">
        <div class="app-card-header">
          <h2 class="app-card-title">
            <i class="bi bi-arrow-left-right text-primary"></i>
            <span>Returns &amp; Exchange Processing</span>
          </h2>
          <span class="badge bg-light text-muted border">Policy: 14 Days</span>
        </div>
        <div class="app-card-body p-4">
          <p class="text-secondary small mb-3">
            Scan invoice barcode or enter the customer's phone number to retrieve original POS sale record and verify hardware IMEI conditions.
          </p>

          <div class="row g-3 mb-4">
            <div class="col-12 col-md-6">
              <label for="invScan" class="app-form-label">Scan Invoice # or Serial Barcode</label>
              <div class="input-group">
                <span class="input-group-text bg-light"><i class="bi bi-upc-scan"></i></span>
                <input id="invScan" type="text" class="app-input font-monospace" placeholder="e.g. INV-2026-0841" />
                <button type="button" class="btn btn-primary" (click)="toast.info('Invoice Lookup', 'Retrieved Invoice #INV-2026-0841. Eligible for replacement.')">
                  Search
                </button>
              </div>
            </div>
          </div>

          <div class="p-3 rounded bg-light border">
            <h3 class="h6 fw-bold text-dark mb-2">Standard Return Guidelines</h3>
            <ul class="small text-secondary mb-0 ps-3">
              <li>Device condition grade must match original sale condition (Grade A or New).</li>
              <li>iCloud / Google FRP account locks must be completely removed by customer before exchange.</li>
              <li>Battery health check required for pre-owned exchanges.</li>
            </ul>
          </div>
        </div>
      </div>

      <div *ngIf="mode === 'warranty'" class="app-card mb-4">
        <div class="app-card-header">
          <h2 class="app-card-title">
            <i class="bi bi-shield-check text-success"></i>
            <span>Warranty &amp; IMEI Repair Tracking</span>
          </h2>
          <span class="badge bg-success-subtle text-success border">Store Coverage: 90 Days</span>
        </div>
        <div class="app-card-body p-4">
          <div class="row g-3 mb-4">
            <div class="col-12 col-md-6">
              <label for="imeiCheck" class="app-form-label">Enter IMEI to Verify Coverage</label>
              <div class="input-group">
                <span class="input-group-text bg-light"><i class="bi bi-phone"></i></span>
                <input id="imeiCheck" type="text" class="app-input font-monospace" placeholder="354892019482711" />
                <button type="button" class="btn btn-success" (click)="toast.success('Warranty Active', 'IMEI 354892019482711 has 82 days remaining store warranty.')">
                  Verify IMEI
                </button>
              </div>
            </div>
          </div>

          <div class="p-3 rounded bg-light border">
            <div class="fw-semibold text-dark small mb-1">Active Store Protection Policy</div>
            <p class="small text-secondary mb-0">
              Covers motherboard failure, camera sensors, and battery degradation below 80%. Accidental liquid or screen impact damage is excluded under standard warranty.
            </p>
          </div>
        </div>
      </div>

      <div *ngIf="mode === 'settings'" class="app-card mb-4">
        <div class="app-card-header">
          <h2 class="app-card-title">
            <i class="bi bi-sliders2 text-primary"></i>
            <span>Store Location &amp; POS Register Settings</span>
          </h2>
          <span class="badge bg-light text-muted border">Tenant ID: SHOP-DOWNTOWN-01</span>
        </div>
        <div class="app-card-body p-4">
          <div class="row g-3">
            <div class="col-12 col-md-6">
              <label for="sName" class="app-form-label">Store Public Name</label>
              <input id="sName" type="text" class="app-input" value="Downtown Flagship Store" />
            </div>

            <div class="col-12 col-md-6">
              <label for="sTax" class="app-form-label">Default Sales Tax / VAT Rate (%)</label>
              <input id="sTax" type="number" class="app-input font-monospace" value="5.0" />
            </div>

            <div class="col-12 col-md-6">
              <label for="sPrinter" class="app-form-label">Receipt Printer Driver</label>
              <select id="sPrinter" class="app-input">
                <option selected>Epson TM-T88VI (80mm Thermal)</option>
                <option>Star Micronics TSP143III</option>
                <option>Standard A4 Laser/Inkjet</option>
              </select>
            </div>

            <div class="col-12 col-md-6">
              <label for="sCurrency" class="app-form-label">Operating Currency</label>
              <select id="sCurrency" class="app-input">
                <option selected>USD ($) &middot; United States Dollar</option>
                <option>EUR (€) &middot; Euro</option>
                <option>GBP (£) &middot; British Pound</option>
                <option>CAD ($) &middot; Canadian Dollar</option>
              </select>
            </div>
          </div>

          <div class="d-flex justify-content-end gap-2 pt-4 border-top mt-4">
            <button type="button" class="btn-app btn-app-primary" (click)="toast.success('Configuration Saved', 'Store operational preferences updated.')">
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class OperationsComponent implements OnInit {
  mode: 'returns' | 'warranty' | 'settings' = 'returns';
  pageTitle = 'Returns & Exchanges';

  constructor(
    private readonly route: ActivatedRoute,
    public readonly toast: ToastService
  ) {}

  ngOnInit(): void {
    const path = this.route.snapshot.url[0]?.path;
    if (path === 'warranty') {
      this.mode = 'warranty';
      this.pageTitle = 'Warranties & IMEI Repairs';
    } else if (path === 'settings') {
      this.mode = 'settings';
      this.pageTitle = 'Store Configuration & Settings';
    } else {
      this.mode = 'returns';
      this.pageTitle = 'Returns & Exchanges';
    }
  }

  onAction(): void {
    this.toast.info('Audit Log', 'Viewing recent audit events for this terminal.');
  }
}
