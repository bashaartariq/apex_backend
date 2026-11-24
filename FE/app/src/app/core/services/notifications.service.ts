import { Injectable } from '@angular/core';
import { BehaviorSubject, forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PosService } from './pos.service';
import { InventoryService } from './inventory.service';
import { AuthService } from './auth.service';
import { CreditOverride, DiscountRequest } from '../models/pos.models';
import { AccessoryItem } from '../models/inventory.models';

export interface LiveAlertItem {
  id: string;
  kind: 'DISCOUNT' | 'CREDIT_OVERRIDE' | 'LOW_STOCK';
  title: string;
  detail: string;
  meta: string;
  tone: 'warning' | 'danger' | 'info' | 'brand';
  icon: string;
  route: string;
  queryParams?: Record<string, string>;
  rawDiscount?: DiscountRequest;
  rawCreditOverride?: CreditOverride;
  rawLowStock?: AccessoryItem;
}

export interface LiveAlertsSnapshot {
  pendingDiscounts: DiscountRequest[];
  pendingCreditOverrides: CreditOverride[];
  lowStockAccessories: AccessoryItem[];
  alerts: LiveAlertItem[];
  totalCount: number;
  loading: boolean;
  lastUpdated: Date | null;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationsService {
  private readonly stateSubject = new BehaviorSubject<LiveAlertsSnapshot>({
    pendingDiscounts: [],
    pendingCreditOverrides: [],
    lowStockAccessories: [],
    alerts: [],
    totalCount: 0,
    loading: false,
    lastUpdated: null,
  });

  readonly state$ = this.stateSubject.asObservable();

  constructor(
    private readonly posService: PosService,
    private readonly inventoryService: InventoryService,
    private readonly auth: AuthService
  ) {}

  get snapshot(): LiveAlertsSnapshot {
    return this.stateSubject.value;
  }

  refresh(): void {
    if (!this.auth.isAuthenticated) {
      this.clear();
      return;
    }

    const canPos = this.auth.isAdmin() || this.auth.hasPermission('pos.access');
    const canInventory = this.auth.isAdmin() || this.auth.hasPermission('inventory.view') || this.auth.hasPermission('accessories.view');

    this.stateSubject.next({ ...this.stateSubject.value, loading: true });

    forkJoin({
      discounts: canPos ? this.posService.getPendingDiscounts().pipe(catchError(() => of([] as DiscountRequest[]))) : of([] as DiscountRequest[]),
      overrides: canPos ? this.posService.getPendingCreditOverrides().pipe(catchError(() => of([] as CreditOverride[]))) : of([] as CreditOverride[]),
      lowStock: canInventory ? this.inventoryService.getLowStock().pipe(catchError(() => of([] as AccessoryItem[]))) : of([] as AccessoryItem[]),
    }).subscribe(({ discounts, overrides, lowStock }) => {
      const alerts: LiveAlertItem[] = [];

      for (const d of discounts) {
        alerts.push({
          id: `disc-${d.id}`,
          kind: 'DISCOUNT',
          title: `Discount Approval: ${d.productName}`,
          detail: `${d.requesterName} requested $${d.requestedPrice.toFixed(2)} (was $${d.defaultPrice.toFixed(2)}) — "${d.reason}"`,
          meta: `-$${d.discountAmount.toFixed(2)} off`,
          tone: 'warning',
          icon: 'bi-tag-fill',
          route: '/pos',
          rawDiscount: d,
        });
      }

      for (const ovr of overrides) {
        alerts.push({
          id: `ovr-${ovr.id}`,
          kind: 'CREDIT_OVERRIDE',
          title: `Credit Override: ${ovr.customerName}`,
          detail: `${ovr.requesterName} requested +$${ovr.excessAmount.toFixed(2)} over credit limit — "${ovr.reason}"`,
          meta: `Sale $${ovr.saleAmount.toFixed(2)}`,
          tone: 'danger',
          icon: 'bi-shield-exclamation',
          route: '/pos',
          rawCreditOverride: ovr,
        });
      }

      for (const acc of lowStock.slice(0, 8)) {
        alerts.push({
          id: `low-${acc.id}`,
          kind: 'LOW_STOCK',
          title: `Low Stock: ${acc.name}`,
          detail: `SKU ${acc.sku} has ${acc.available_quantity ?? 0} units remaining (min threshold ${acc.min_stock_threshold ?? 5}).`,
          meta: `${acc.available_quantity ?? 0} left`,
          tone: 'info',
          icon: 'bi-exclamation-triangle-fill',
          route: '/inventory/accessories',
          queryParams: { search: acc.sku },
          rawLowStock: acc,
        });
      }

      this.stateSubject.next({
        pendingDiscounts: discounts,
        pendingCreditOverrides: overrides,
        lowStockAccessories: lowStock,
        alerts,
        totalCount: discounts.length + overrides.length + lowStock.length,
        loading: false,
        lastUpdated: new Date(),
      });
    });
  }

  clear(): void {
    this.stateSubject.next({
      pendingDiscounts: [],
      pendingCreditOverrides: [],
      lowStockAccessories: [],
      alerts: [],
      totalCount: 0,
      loading: false,
      lastUpdated: null,
    });
  }
}

