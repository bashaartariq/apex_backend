import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SystemStatusService, SystemConnectivityState } from '../../core/services/system-status.service';
import { TenantContextService } from '../../core/services/tenant-context.service';

@Component({
  selector: 'app-foundation',
  templateUrl: './foundation.component.html',
  styleUrls: ['./foundation.component.scss'],
})
export class FoundationComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  state: SystemConnectivityState = {
    checking: false,
    connected: false,
    health: null,
    version: null,
    error: null,
    lastCheckedAt: null,
  };

  tenantControl = new FormControl('');

  readonly roadmapSteps = [
    {
      step: 'Step 1',
      title: 'Project Foundation',
      status: 'Completed',
      statusClass: 'bg-success',
      icon: 'bi-check2-circle',
      details: 'Angular app shell, Express REST API, SQLite WAL + Foreign Keys, migrations, seeds, and connectivity verification.',
    },
    {
      step: 'Step 2',
      title: 'Inventory & Stock Management',
      status: 'Planned',
      statusClass: 'bg-secondary',
      icon: 'bi-phone',
      details: 'Mobile devices, accessories, IMEI tracking, barcode/SKU, categories, brands, stock alerts, multi-tenant shop scoping.',
    },
    {
      step: 'Step 3',
      title: 'Point of Sale (POS) & Checkout',
      status: 'Planned',
      statusClass: 'bg-secondary',
      icon: 'bi-receipt-cutoff',
      details: 'Fast product search, cart management, discount/tax calculations, multiple payment modes, thermal receipts, atomic stock updates.',
    },
    {
      step: 'Step 4',
      title: 'Customers, Warranties & Invoices',
      status: 'Planned',
      statusClass: 'bg-secondary',
      icon: 'bi-people',
      details: 'Customer directory, purchase history, IMEI warranty tracking, returns, PDF invoice generation, search and filters.',
    },
    {
      step: 'Step 5',
      title: 'Analytics, Reporting & Tenant Admin',
      status: 'Planned',
      statusClass: 'bg-secondary',
      icon: 'bi-graph-up-arrow',
      details: 'Daily sales, profit margin metrics, low-stock warnings, multi-tenant shop onboarding, user roles and permissions.',
    },
  ];

  constructor(
    private readonly statusService: SystemStatusService,
    private readonly tenantService: TenantContextService
  ) {}

  ngOnInit(): void {
    this.statusService.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.state = state;
      });

    this.tenantControl.setValue(this.tenantService.currentShopId || 'SHOP-DEMO-01');
    this.tenantService.setActiveShopId(this.tenantControl.value);

    this.tenantControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((val) => {
        this.tenantService.setActiveShopId(val);
      });

    this.refreshStatus();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  refreshStatus(): void {
    this.statusService.checkConnectivity().subscribe();
  }
}
