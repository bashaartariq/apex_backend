import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ReturnsService } from '../../core/services/returns.service';
import { WarrantyService } from '../../core/services/warranty.service';
import { SalesService } from '../../core/services/sales.service';
import { PosService } from '../../core/services/pos.service';
import { ToastService } from '../../core/services/toast.service';
import { SaleDetails, ReturnRecord, WarrantyClaim, PosProductItem } from '../../core/models/pos.models';

@Component({
  selector: 'app-operations',
  templateUrl: './operations.component.html',
  styleUrls: ['./operations.component.scss'],
})
export class OperationsComponent implements OnInit, OnDestroy {
  mode: 'returns' | 'warranty' | 'settings' = 'returns';
  pageTitle = 'Returns & Exchanges';
  private readonly sub = new Subscription();

  // Returns & Exchanges State
  invoiceSearchTerm = '';
  searchedSale: SaleDetails | null = null;
  isLoadingSale = false;
  isLoadingReturns = false;
  returnReason = '';
  returnItemsSelection: { [saleItemId: string]: { selected: boolean; quantity: number; refundAmount: number; restore: boolean } } = {};
  isExchangeMode = false;
  replacementCatalog: PosProductItem[] = [];
  selectedReplacementItem: PosProductItem | null = null;
  replacementQuantity = 1;
  replacementActualPrice = 0;
  exchangePaymentMethod = 'CASH';
  isProcessingReturn = false;
  returnsHistory: ReturnRecord[] = [];
  recentInvoices: Array<{ id: string; invoiceNo: string; customerName: string; totalAmount: number }> = [];

  // Warranty State
  warrantySearchTerm = '';
  claimStatusFilter: 'ALL' | 'OPEN' | 'REPAIR' | 'DONE' = 'ALL';
  warrantiesList: any[] = [];
  warrantyClaims: WarrantyClaim[] = [];
  isLoadingWarranty = false;
  isLoadingClaims = false;
  showNewClaimModal = false;
  selectedWarrantyRecord: any = null;
  claimProblemDescription = '';
  showUpdateClaimModal = false;
  activeClaim: WarrantyClaim | null = null;
  updateClaimStatus = 'UNDER_REPAIR';
  updateRepairNotes = '';
  updatePartsUsed = '';
  updateLaborCost = 0;
  updateCustomerCharge = 0;
  updateReplacementImei = '';
  isProcessingClaim = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly returnsService: ReturnsService,
    private readonly warrantyService: WarrantyService,
    private readonly salesService: SalesService,
    private readonly posService: PosService,
    public readonly toast: ToastService
  ) {}

  ngOnInit(): void {
    const url = this.route.snapshot.url[0]?.path;
    if (url === 'warranty') {
      this.mode = 'warranty';
      this.pageTitle = 'Warranty & Repair Claims';
      this.loadWarranties();
      this.loadWarrantyClaims();
    } else {
      this.mode = 'returns';
      this.pageTitle = 'Returns & Multi-Product Exchanges';
      this.loadReturnsHistory();
      this.loadRecentInvoices();
    }
  }

  get totalRefundsDisbursed(): number {
    return this.returnsHistory.reduce((sum, r) => sum + (r.totalRefundAmount || 0), 0);
  }

  get exchangesCount(): number {
    return this.returnsHistory.filter((r) => r.returnType === 'EXCHANGE').length;
  }

  get activeWarrantiesCount(): number {
    return this.warrantiesList.filter((w) => w.status === 'ACTIVE').length;
  }

  get openClaimsCount(): number {
    return this.warrantyClaims.filter((c) => !['DELIVERED', 'CLOSED', 'REJECTED'].includes(c.status)).length;
  }

  get completedClaimsCount(): number {
    return this.warrantyClaims.filter((c) => ['DELIVERED', 'CLOSED', 'REPAIRED'].includes(c.status)).length;
  }

  get filteredWarrantyClaims(): WarrantyClaim[] {
    if (this.claimStatusFilter === 'ALL') return this.warrantyClaims;
    if (this.claimStatusFilter === 'OPEN') {
      return this.warrantyClaims.filter((c) => ['REGISTERED', 'UNDER_INSPECTION', 'APPROVED'].includes(c.status));
    }
    if (this.claimStatusFilter === 'REPAIR') {
      return this.warrantyClaims.filter((c) => ['UNDER_REPAIR', 'SENT_TO_SUPPLIER', 'READY_FOR_COLLECTION'].includes(c.status));
    }
    return this.warrantyClaims.filter((c) => ['REPAIRED', 'DELIVERED', 'CLOSED', 'REJECTED'].includes(c.status));
  }

  getClaimStageIndex(status: string): number {
    if (status === 'REGISTERED') return 1;
    if (status === 'UNDER_INSPECTION' || status === 'APPROVED') return 2;
    if (status === 'UNDER_REPAIR' || status === 'SENT_TO_SUPPLIER') return 3;
    if (status === 'REPAIRED' || status === 'READY_FOR_COLLECTION') return 4;
    if (status === 'DELIVERED' || status === 'CLOSED') return 5;
    return 1;
  }

  loadRecentInvoices(): void {
    this.sub.add(
      this.salesService.getSales().subscribe({
        next: (sales) => {
          this.recentInvoices = sales.slice(0, 6).map((s) => ({
            id: s.id,
            invoiceNo: s.invoiceNo,
            customerName: s.customerName || 'Walk-in',
            totalAmount: s.totalAmount,
          }));
        },
        error: () => {},
      })
    );
  }

  quickPickInvoice(invoiceNo: string): void {
    this.invoiceSearchTerm = invoiceNo;
    this.searchInvoice();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  @HostListener('window:keydown.escape')
  handleEscape(): void {
    if (this.showNewClaimModal) {
      this.showNewClaimModal = false;
      return;
    }
    if (this.showUpdateClaimModal) {
      this.showUpdateClaimModal = false;
      return;
    }
  }

  // --- Returns & Exchanges ---
  loadReturnsHistory(): void {
    this.isLoadingReturns = true;
    this.sub.add(
      this.returnsService.getReturns().subscribe({
        next: (data) => {
          this.returnsHistory = data;
          this.isLoadingReturns = false;
        },
        error: () => {
          this.isLoadingReturns = false;
        },
      })
    );
  }

  searchInvoice(): void {
    const query = this.invoiceSearchTerm.trim();
    if (!query) return;

    this.isLoadingSale = true;
    this.searchedSale = null;
    this.returnItemsSelection = {};

    this.sub.add(
      this.salesService.getSales({ search: query }).subscribe({
        next: (sales) => {
          if (sales.length === 0) {
            this.isLoadingSale = false;
            this.toast.warning(`No sale found matching "${query}"`);
            return;
          }

          const saleSummary = sales[0];
          this.sub.add(
            this.salesService.getSaleById(saleSummary.id).subscribe({
              next: (details) => {
                this.searchedSale = details;
                this.isLoadingSale = false;
                // Initialize return selection map
                for (const item of details.items) {
                  this.returnItemsSelection[item.id] = {
                    selected: false,
                    quantity: item.quantity,
                    refundAmount: item.actualPrice,
                    restore: true,
                  };
                }
              },
              error: (err) => {
                this.isLoadingSale = false;
                this.toast.error('Failed to load sale line items: ' + (err.error?.message || err.message));
              },
            })
          );
        },
        error: (err) => {
          this.isLoadingSale = false;
          this.toast.error('Search failed: ' + (err.error?.message || err.message));
        },
      })
    );
  }

  get selectedReturnItemsCount(): number {
    return Object.values(this.returnItemsSelection).filter((s) => s.selected).length;
  }

  get totalCalculatedRefund(): number {
    let sum = 0;
    for (const [id, s] of Object.entries(this.returnItemsSelection)) {
      if (s.selected) {
        sum += s.quantity * s.refundAmount;
      }
    }
    return Math.round(sum * 100) / 100;
  }

  get exchangeDifference(): { amount: number; type: 'CUSTOMER_PAYS' | 'SHOP_REFUNDS' | 'EVEN' } {
    if (!this.selectedReplacementItem) {
      return { amount: 0, type: 'EVEN' };
    }
    const replacementTotal = this.replacementActualPrice * this.replacementQuantity;
    const returnedTotal = this.totalCalculatedRefund;
    const diff = Math.round((replacementTotal - returnedTotal) * 100) / 100;

    if (diff > 0.001) return { amount: diff, type: 'CUSTOMER_PAYS' };
    if (diff < -0.001) return { amount: Math.abs(diff), type: 'SHOP_REFUNDS' };
    return { amount: 0, type: 'EVEN' };
  }

  toggleExchangeMode(): void {
    this.isExchangeMode = !this.isExchangeMode;
    if (this.isExchangeMode && this.replacementCatalog.length === 0) {
      this.posService.searchProducts().subscribe({
        next: (items) => (this.replacementCatalog = items),
      });
    }
  }

  selectReplacementProduct(prod: PosProductItem): void {
    this.selectedReplacementItem = prod;
    this.replacementActualPrice = prod.defaultPrice;
    this.replacementQuantity = 1;
  }

  submitReturnOrExchange(): void {
    if (!this.searchedSale) return;
    if (this.selectedReturnItemsCount === 0) {
      this.toast.warning('Please select at least one item to return');
      return;
    }
    if (!this.returnReason || this.returnReason.trim().length < 3) {
      this.toast.warning('A return reason is mandatory');
      return;
    }

    const returnItemsPayload = Object.entries(this.returnItemsSelection)
      .filter(([_, s]) => s.selected)
      .map(([saleItemId, s]) => ({
        saleItemId,
        quantity: s.quantity,
        unitRefundAmount: s.refundAmount,
        restoreToInventory: s.restore,
      }));

    this.isProcessingReturn = true;

    if (this.isExchangeMode) {
      if (!this.selectedReplacementItem) {
        this.toast.warning('Please select a replacement product from the catalog');
        this.isProcessingReturn = false;
        return;
      }

      const payload = {
        returnPayload: {
          saleId: this.searchedSale.sale.id,
          returnType: 'EXCHANGE' as const,
          reason: this.returnReason.trim(),
          items: returnItemsPayload,
        },
        replacementItems: [
          {
            itemType: this.selectedReplacementItem.itemType,
            productId: this.selectedReplacementItem.id,
            quantity: this.replacementQuantity,
            actualPrice: this.replacementActualPrice,
          },
        ],
        paymentMethod: this.exchangePaymentMethod,
      };

      this.returnsService.processExchange(payload).subscribe({
        next: (res) => {
          this.isProcessingReturn = false;
          this.toast.success(
            `Exchange processed! Return: ${res.returnNo}, New Invoice: ${res.newInvoiceNo} (${res.differenceType}: $${res.differenceAmount})`
          );
          this.resetReturnForm();
          this.loadReturnsHistory();
        },
        error: (err) => {
          this.isProcessingReturn = false;
          this.toast.error('Exchange failed: ' + (err.error?.message || err.message));
        },
      });
    } else {
      // Direct Refund
      const payload = {
        saleId: this.searchedSale.sale.id,
        returnType: 'REFUND' as const,
        reason: this.returnReason.trim(),
        items: returnItemsPayload,
      };

      this.returnsService.processReturn(payload).subscribe({
        next: (res) => {
          this.isProcessingReturn = false;
          this.toast.success(`Return processed! Return No: ${res.returnNo}. Total refunded: $${res.totalRefundAmount.toFixed(2)}`);
          this.resetReturnForm();
          this.loadReturnsHistory();
        },
        error: (err) => {
          this.isProcessingReturn = false;
          this.toast.error('Return failed: ' + (err.error?.message || err.message));
        },
      });
    }
  }

  resetReturnForm(): void {
    this.searchedSale = null;
    this.invoiceSearchTerm = '';
    this.returnReason = '';
    this.returnItemsSelection = {};
    this.isExchangeMode = false;
    this.selectedReplacementItem = null;
  }

  // --- Warranty & Repairs ---
  loadWarranties(): void {
    this.isLoadingWarranty = true;
    this.sub.add(
      this.warrantyService.getWarranties(this.warrantySearchTerm).subscribe({
        next: (data) => {
          this.warrantiesList = data;
          this.isLoadingWarranty = false;
        },
        error: () => (this.isLoadingWarranty = false),
      })
    );
  }

  loadWarrantyClaims(): void {
    this.isLoadingClaims = true;
    this.sub.add(
      this.warrantyService.getClaims().subscribe({
        next: (data) => {
          this.warrantyClaims = data;
          this.isLoadingClaims = false;
        },
        error: () => {
          this.isLoadingClaims = false;
        },
      })
    );
  }

  openRegisterClaim(warr: any): void {
    this.selectedWarrantyRecord = warr;
    this.claimProblemDescription = '';
    this.showNewClaimModal = true;
  }

  submitNewClaim(): void {
    if (!this.selectedWarrantyRecord) return;
    if (!this.claimProblemDescription || this.claimProblemDescription.trim().length < 5) {
      this.toast.warning('Please describe the reported defect or problem');
      return;
    }

    this.isProcessingClaim = true;
    this.warrantyService.createClaim(this.selectedWarrantyRecord.id, this.claimProblemDescription.trim()).subscribe({
      next: (claim) => {
        this.isProcessingClaim = false;
        this.showNewClaimModal = false;
        this.toast.success(`Claim ${claim.claimRef} registered! Device marked UNDER_REPAIR.`);
        this.loadWarrantyClaims();
        this.loadWarranties();
      },
      error: (err) => {
        this.isProcessingClaim = false;
        this.toast.error('Failed to register claim: ' + (err.error?.message || err.message));
      },
    });
  }

  openUpdateClaim(claim: WarrantyClaim): void {
    this.activeClaim = claim;
    this.updateClaimStatus = claim.status;
    this.updateRepairNotes = claim.repairNotes || '';
    this.updatePartsUsed = claim.partsUsed || '';
    this.updateLaborCost = claim.laborCost || 0;
    this.updateCustomerCharge = claim.customerCharge || 0;
    this.updateReplacementImei = claim.replacementImei || '';
    this.showUpdateClaimModal = true;
  }

  saveClaimStatus(): void {
    if (!this.activeClaim) return;

    this.isProcessingClaim = true;
    this.warrantyService
      .updateClaim(this.activeClaim.id, {
        status: this.updateClaimStatus,
        repairNotes: this.updateRepairNotes,
        partsUsed: this.updatePartsUsed,
        laborCost: Number(this.updateLaborCost) || 0,
        customerCharge: Number(this.updateCustomerCharge) || 0,
        replacementImei: this.updateReplacementImei,
      })
      .subscribe({
        next: (updated) => {
          this.isProcessingClaim = false;
          this.showUpdateClaimModal = false;
          this.toast.success(`Claim ${this.activeClaim?.claimRef} updated to ${updated.status}`);
          this.loadWarrantyClaims();
        },
        error: (err) => {
          this.isProcessingClaim = false;
          this.toast.error('Failed to update claim: ' + (err.error?.message || err.message));
        },
      });
  }
}
