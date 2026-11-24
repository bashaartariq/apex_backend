import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { ReportsService } from '../../core/services/reports.service';
import { ToastService } from '../../core/services/toast.service';
import {
  SalesReportData,
  PurchasesReportData,
  InventoryReportData,
  ProfitReportData,
  CustomerCreditReportData,
  ReturnsWarrantyReportData,
  ReportFilterParams,
} from '../../core/models/reports.models';

export type ReportTab = 'sales' | 'profit' | 'inventory' | 'purchases' | 'customers' | 'returns-warranty';

@Component({
  selector: 'app-reports',
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss'],
})
export class ReportsComponent implements OnInit, OnDestroy {
  activeTab: ReportTab = 'sales';
  isAdmin = false;
  isLoading = false;
  isExporting = false;

  // Filter Bar state
  selectedRange = 'last30days';
  dateFrom = '';
  dateTo = '';
  productType = '';
  searchTerm = '';
  debtorsOnly = true;

  // Data states
  salesData: SalesReportData | null = null;
  purchasesData: PurchasesReportData | null = null;
  inventoryData: InventoryReportData | null = null;
  profitData: ProfitReportData | null = null;
  customerData: CustomerCreditReportData | null = null;
  returnsWarrantyData: ReturnsWarrantyReportData | null = null;

  private userSub?: Subscription;
  private reportSub?: Subscription;

  constructor(
    public readonly auth: AuthService,
    private readonly reportsService: ReportsService,
    private readonly toast: ToastService
  ) {}

  ngOnInit(): void {
    this.userSub = this.auth.currentUser$.subscribe((user) => {
      if (user) {
        this.isAdmin = user.role === 'SHOP_ADMIN';
        this.loadActiveReport();
      }
    });
  }

  ngOnDestroy(): void {
    this.userSub?.unsubscribe();
    this.reportSub?.unsubscribe();
  }

  setTab(tab: ReportTab): void {
    if ((tab === 'profit' || tab === 'purchases') && !this.isAdmin) {
      this.toast.error('Restricted', 'Only Shop Administrators can access profit and supplier purchase reports.');
      return;
    }
    this.activeTab = tab;
    this.loadActiveReport();
  }

  setRange(range: string): void {
    this.selectedRange = range;
    if (range !== 'custom') {
      this.dateFrom = '';
      this.dateTo = '';
    }
    this.loadActiveReport();
  }

  buildFilterParams(): ReportFilterParams {
    const params: ReportFilterParams = {};
    if (this.selectedRange) {
      params.range = this.selectedRange;
    }
    if (this.selectedRange === 'custom') {
      if (this.dateFrom) params.dateFrom = this.dateFrom;
      if (this.dateTo) params.dateTo = this.dateTo;
    }
    if (this.productType) {
      params.productType = this.productType;
    }
    if (this.searchTerm) {
      params.search = this.searchTerm;
    }
    if (this.activeTab === 'customers') {
      params.debtorsOnly = this.debtorsOnly ? 'true' : 'false';
    }
    return params;
  }

  loadActiveReport(): void {
    this.reportSub?.unsubscribe();
    this.isLoading = true;
    const params = this.buildFilterParams();

    switch (this.activeTab) {
      case 'sales':
        this.reportSub = this.reportsService.getSalesReport(params).subscribe({
          next: (res) => {
            this.salesData = res.data;
            this.isLoading = false;
          },
          error: (err) => {
            this.toast.error('Failed to load sales report', err.message);
            this.isLoading = false;
          },
        });
        break;

      case 'profit':
        if (!this.isAdmin) {
          this.isLoading = false;
          return;
        }
        this.reportSub = this.reportsService.getProfitReport(params).subscribe({
          next: (res) => {
            this.profitData = res.data;
            this.isLoading = false;
          },
          error: (err) => {
            this.toast.error('Failed to load profit report', err.message);
            this.isLoading = false;
          },
        });
        break;

      case 'inventory':
        this.reportSub = this.reportsService.getInventoryReport(params).subscribe({
          next: (res) => {
            this.inventoryData = res.data;
            this.isLoading = false;
          },
          error: (err) => {
            this.toast.error('Failed to load inventory valuation report', err.message);
            this.isLoading = false;
          },
        });
        break;

      case 'purchases':
        if (!this.isAdmin) {
          this.isLoading = false;
          return;
        }
        this.reportSub = this.reportsService.getPurchasesReport(params).subscribe({
          next: (res) => {
            this.purchasesData = res.data;
            this.isLoading = false;
          },
          error: (err) => {
            this.toast.error('Failed to load purchases report', err.message);
            this.isLoading = false;
          },
        });
        break;

      case 'customers':
        this.reportSub = this.reportsService.getCustomerCreditReport(params).subscribe({
          next: (res) => {
            this.customerData = res.data;
            this.isLoading = false;
          },
          error: (err) => {
            this.toast.error('Failed to load customer credit report', err.message);
            this.isLoading = false;
          },
        });
        break;

      case 'returns-warranty':
        this.reportSub = this.reportsService.getReturnsWarrantyReport(params).subscribe({
          next: (res) => {
            this.returnsWarrantyData = res.data;
            this.isLoading = false;
          },
          error: (err) => {
            this.toast.error('Failed to load returns & warranty report', err.message);
            this.isLoading = false;
          },
        });
        break;
    }
  }

  get maxDailyProfitRevenue(): number {
    if (!this.profitData?.dailyProfit?.length) return 1;
    return Math.max(1, ...this.profitData.dailyProfit.map((d) => Math.max(d.revenue || 0, d.profit || 0)));
  }

  get totalPaymentBreakdownVolume(): number {
    if (!this.salesData?.paymentBreakdown?.length) return 1;
    return Math.max(1, this.salesData.paymentBreakdown.reduce((s, p) => s + (p.total || 0), 0));
  }

  get maxSupplierSpend(): number {
    if (!this.purchasesData?.supplierBreakdown?.length) return 1;
    return Math.max(1, ...this.purchasesData.supplierBreakdown.map((s) => s.totalSpent || 0));
  }

  exportCsv(): void {
    this.isExporting = true;
    const reportName = this.activeTab;
    const params = this.buildFilterParams();

    this.reportsService.exportCsv(reportName, params).subscribe({
      next: (blob) => {
        const dateStr = new Date().toISOString().slice(0, 10);
        this.reportsService.downloadBlob(blob, `${reportName}_report_${dateStr}.csv`);
        this.toast.success('CSV Downloaded', `Successfully exported ${reportName} report to RFC 4180 CSV.`);
        this.isExporting = false;
      },
      error: (err) => {
        this.toast.error('Export Failed', err.message || 'Could not generate CSV export');
        this.isExporting = false;
      },
    });
  }

  exportPdf(): void {
    this.isExporting = true;
    const reportName = this.activeTab;
    const params = this.buildFilterParams();

    this.reportsService.exportPdf(reportName, params).subscribe({
      next: (blob) => {
        const dateStr = new Date().toISOString().slice(0, 10);
        this.reportsService.downloadBlob(blob, `${reportName}_report_${dateStr}.pdf`);
        this.toast.success('PDF Downloaded', `Successfully exported ${reportName} report to Landscape A4 PDF.`);
        this.isExporting = false;
      },
      error: (err) => {
        this.toast.error('Export Failed', err.message || 'Could not generate PDF export');
        this.isExporting = false;
      },
    });
  }
}
