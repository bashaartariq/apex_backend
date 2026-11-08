import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MockDataService } from '../../core/services/mock-data.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import { PosSaleTransaction } from '../../core/models/inventory.models';

export interface ChartPoint {
  label: string;
  sales: number;
  cost: number;
  profit: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit {
  selectedPeriod: 'today' | 'week' | 'month' = 'today';
  recentSales: PosSaleTransaction[] = [];
  selectedReceiptSale: PosSaleTransaction | null = null;
  showReceiptModal = false;

  readonly chartData: ChartPoint[] = [
    { label: '09:00', sales: 1250, cost: 890, profit: 360 },
    { label: '11:00', sales: 3420, cost: 2310, profit: 1110 },
    { label: '13:00', sales: 2180, cost: 1450, profit: 730 },
    { label: '15:00', sales: 4890, cost: 3200, profit: 1690 },
    { label: '17:00', sales: 3080, cost: 2100, profit: 980 },
    { label: '19:00', sales: 1800, cost: 1150, profit: 650 },
  ];

  readonly brandShare = [
    { brand: 'Apple', percentage: 48, units: 68, color: '#2563eb' },
    { brand: 'Samsung', percentage: 32, units: 45, color: '#0ea5e9' },
    { brand: 'Google', percentage: 12, units: 17, color: '#10b981' },
    { brand: 'Xiaomi & Others', percentage: 8, units: 12, color: '#8b5cf6' },
  ];

  readonly lowStockItems = [
    { name: 'Baseus 20,000mAh 65W Power Bank', sku: 'BAS-PB-20K-65W', stock: 4, min: 8, category: 'Power Banks' },
    { name: 'Samsung 45W Fast Charger', sku: 'SAM-PWR-45W', stock: 5, min: 12, category: 'Chargers' },
    { name: 'iPhone 15 Pro MagSafe Silicone Case', sku: 'CASE-IP15P-MID', stock: 8, min: 10, category: 'Cases' },
    { name: 'Google Pixel 8 Pro Bay Blue (128GB)', sku: 'PIX-8P-BLU', stock: 3, min: 5, category: 'Smartphones' },
  ];

  constructor(
    public readonly auth: AuthService,
    private readonly mockData: MockDataService,
    private readonly toast: ToastService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.mockData.sales$.subscribe((sales) => {
      this.recentSales = sales.slice(0, 5);
    });
  }

  setPeriod(period: 'today' | 'week' | 'month'): void {
    this.selectedPeriod = period;
    this.toast.info('Filter Applied', `Dashboard metrics updated for ${period.toUpperCase()}.`);
  }

  quickReorder(item: { name: string; sku: string }): void {
    this.toast.success('Purchase Reorder Created', `Draft purchase order generated for ${item.name} (${item.sku}).`);
  }

  viewReceipt(sale: PosSaleTransaction): void {
    this.selectedReceiptSale = sale;
    this.showReceiptModal = true;
  }

  closeReceipt(): void {
    this.showReceiptModal = false;
    this.selectedReceiptSale = null;
  }

  printReceipt(): void {
    window.print();
    this.toast.info('Printing', 'Sent receipt to thermal slip printer.');
  }

  goToPos(): void {
    this.router.navigate(['/pos']);
  }

  goToPhones(): void {
    this.router.navigate(['/inventory/phones']);
  }
}
