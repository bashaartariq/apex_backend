import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { SalesService } from '../../core/services/sales.service';
import { PaymentsService } from '../../core/services/payments.service';
import { PosService } from '../../core/services/pos.service';
import { NotificationsService, LiveAlertsSnapshot } from '../../core/services/notifications.service';
import { ToastService } from '../../core/services/toast.service';
import {
  AdminDashboardData,
  DailySalesTrend,
  ShopkeeperDashboardData,
} from '../../core/models/reports.models';

export interface TelemetryBarPoint {
  date: string;
  shortLabel: string;
  revenue: number;
  profit: number;
  transactionsCount: number;
  marginPct: number;
  revHeightPct: number;
  profitHeightPct: number;
}

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  isLoading = true;
  isAdmin = false;
  activeActivityTab: 'sales' | 'purchases' | 'receipts' | 'returns' = 'sales';

  adminData: AdminDashboardData | null = null;
  shopkeeperData: ShopkeeperDashboardData | null = null;

  chartPoints: TelemetryBarPoint[] = [];
  chartMaxValue = 100;
  selectedDayIndex = -1;

  alertsState: LiveAlertsSnapshot = {
    pendingDiscounts: [],
    pendingCreditOverrides: [],
    lowStockAccessories: [],
    alerts: [],
    totalCount: 0,
    loading: false,
    lastUpdated: null,
  };
  reviewingId: string | null = null;
  lastRefreshed = new Date();

  private readonly sub = new Subscription();

  constructor(
    public readonly auth: AuthService,
    private readonly dashboardService: DashboardService,
    private readonly salesService: SalesService,
    private readonly paymentsService: PaymentsService,
    private readonly posService: PosService,
    private readonly notifications: NotificationsService,
    private readonly toast: ToastService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.sub.add(
      this.notifications.state$.subscribe((snap) => {
        this.alertsState = snap;
      })
    );

    this.sub.add(
      this.auth.currentUser$.subscribe((user) => {
        if (user) {
          this.isAdmin = user.role === 'SHOP_ADMIN';
          this.loadDashboardData();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  get greetingLabel(): string {
    const hr = new Date().getHours();
    if (hr < 12) return 'Good morning';
    if (hr < 18) return 'Good afternoon';
    return 'Good evening';
  }

  get selectedDayPoint(): TelemetryBarPoint | null {
    if (this.chartPoints.length === 0) return null;
    if (this.selectedDayIndex >= 0 && this.selectedDayIndex < this.chartPoints.length) {
      return this.chartPoints[this.selectedDayIndex];
    }
    return this.chartPoints[this.chartPoints.length - 1];
  }

  get topProductMaxRevenue(): number {
    if (!this.adminData?.topSellingProducts?.length) return 1;
    return Math.max(1, ...this.adminData.topSellingProducts.map((p) => p.totalRevenue || 0));
  }

  get pendingApprovalsCount(): number {
    return (
      this.alertsState.pendingDiscounts.length +
      this.alertsState.pendingCreditOverrides.length
    );
  }

  get cashierSharePct(): number {
    if (!this.shopkeeperData || this.shopkeeperData.todayRegisterSales <= 0) return 0;
    return Math.min(
      100,
      Math.round((this.shopkeeperData.myTodaySalesRevenue / this.shopkeeperData.todayRegisterSales) * 100)
    );
  }

  loadDashboardData(): void {
    this.isLoading = true;
    this.notifications.refresh();

    if (this.isAdmin) {
      this.dashboardService.getAdminDashboard().subscribe({
        next: (res) => {
          this.adminData = res.data;
          this.buildChartSeries(res.data.dailyTrends || []);
          this.lastRefreshed = new Date();
          this.isLoading = false;
        },
        error: (err) => {
          this.toast.error('Dashboard Error', err.message || 'Failed to load admin analytics');
          this.isLoading = false;
        },
      });
    } else {
      this.dashboardService.getShopkeeperDashboard().subscribe({
        next: (res) => {
          this.shopkeeperData = res.data;
          this.lastRefreshed = new Date();
          this.isLoading = false;
        },
        error: (err) => {
          this.toast.error('Dashboard Error', err.message || 'Failed to load shopkeeper metrics');
          this.isLoading = false;
        },
      });
    }
  }

  private buildChartSeries(trends: DailySalesTrend[]): void {
    if (!trends.length) {
      this.chartPoints = [];
      this.chartMaxValue = 100;
      this.selectedDayIndex = -1;
      return;
    }

    const rawMax = Math.max(
      ...trends.map((d) => Math.max(d.revenue || 0, d.profit || 0)),
      1
    );
    // Clean rounded ceiling for readable gridlines
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
    this.chartMaxValue = Math.ceil((rawMax * 1.12) / magnitude) * magnitude;

    this.chartPoints = trends.map((d) => {
      const rev = Math.max(0, d.revenue || 0);
      const prof = Math.max(0, d.profit || 0);
      const marginPct = rev > 0 ? Math.round((prof / rev) * 1000) / 10 : 0;
      const parts = String(d.date || '').split('-');
      const shortLabel = parts.length === 3 ? `${parts[1]}/${parts[2]}` : d.date;
      return {
        date: d.date,
        shortLabel,
        revenue: rev,
        profit: prof,
        transactionsCount: d.transactionsCount || 0,
        marginPct,
        revHeightPct: Math.max(rev > 0 ? 4 : 0, Math.min(100, (rev / this.chartMaxValue) * 100)),
        profitHeightPct: Math.max(prof > 0 ? 3 : 0, Math.min(100, (prof / this.chartMaxValue) * 100)),
      };
    });

    this.selectedDayIndex = this.chartPoints.length - 1;
  }

  selectDay(index: number): void {
    this.selectedDayIndex = index;
  }

  setActivityTab(tab: 'sales' | 'purchases' | 'receipts' | 'returns'): void {
    this.activeActivityTab = tab;
  }

  approveOrRejectDiscount(id: string, productName: string, action: 'APPROVE' | 'REJECT'): void {
    this.reviewingId = id;
    this.posService.reviewDiscount(id, action).subscribe({
      next: () => {
        this.reviewingId = null;
        this.toast.success(
          action === 'APPROVE' ? 'Discount Approved' : 'Discount Rejected',
          `${productName} request updated.`
        );
        this.notifications.refresh();
      },
      error: (err) => {
        this.reviewingId = null;
        this.toast.error('Review Failed', err?.error?.message || 'Could not update discount.');
      },
    });
  }

  approveOrRejectCredit(id: string, customerName: string, action: 'APPROVE' | 'REJECT'): void {
    this.reviewingId = id;
    this.posService.reviewCreditOverride(id, action).subscribe({
      next: () => {
        this.reviewingId = null;
        this.toast.success(
          action === 'APPROVE' ? 'Credit Override Authorized' : 'Credit Override Declined',
          `${customerName} credit request updated.`
        );
        this.notifications.refresh();
      },
      error: (err) => {
        this.reviewingId = null;
        this.toast.error('Review Failed', err?.error?.message || 'Could not update override.');
      },
    });
  }

  downloadInvoicePdf(saleId: string, invoiceNo: string): void {
    this.salesService.downloadInvoicePdf(saleId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${invoiceNo}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Download Failed', 'Unable to generate invoice PDF.'),
    });
  }

  downloadReceiptPdf(receiptId: string, receiptNo: string): void {
    this.paymentsService.downloadReceiptPdf(receiptId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${receiptNo}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('Download Failed', 'Unable to generate receipt PDF.'),
    });
  }

  goToPos(): void {
    this.router.navigate(['/pos']);
  }

  goToPhones(): void {
    this.router.navigate(['/inventory/phones']);
  }

  goToAccessories(): void {
    this.router.navigate(['/inventory/accessories']);
  }

  goToReports(): void {
    this.router.navigate(['/reports']);
  }

  goToPurchases(): void {
    this.router.navigate(['/inventory/purchases']);
  }

  goToCustomers(): void {
    this.router.navigate(['/customers']);
  }

  goToReturns(): void {
    this.router.navigate(['/returns']);
  }
}
