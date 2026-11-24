import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormControl } from '@angular/forms';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PosService } from '../../core/services/pos.service';
import { CustomersService } from '../../core/services/customers.service';
import { SalesService } from '../../core/services/sales.service';
import { ShopService } from '../../core/services/shop.service';
import { NotificationsService } from '../../core/services/notifications.service';
import { ToastService } from '../../core/services/toast.service';
import { AuthService } from '../../core/services/auth.service';
import {
  Customer,
  PosProductItem,
  CartItem,
  SplitPaymentLine,
  PaymentMethodType,
  SaleSummary,
  DiscountRequest,
  CreditOverride,
} from '../../core/models/pos.models';
import { isValidCnic, isValidPhone, isValidEmail } from '../../shared/utils/formatters';

interface ParkedSale {
  id: string;
  label: string;
  parkedAt: string;
  customer: Customer | null;
  items: CartItem[];
  total: number;
}

@Component({
  selector: 'app-pos',
  templateUrl: './pos.component.html',
  styleUrls: ['./pos.component.scss'],
})
export class PosComponent implements OnInit, OnDestroy {
  @ViewChild('scannerInputEl') scannerInputEl?: ElementRef<HTMLInputElement>;

  private readonly sub = new Subscription();

  cart: CartItem[] = [];
  catalogItems: PosProductItem[] = [];
  filteredCatalog: PosProductItem[] = [];
  customers: Customer[] = [];
  filteredCustomers: Customer[] = [];

  selectedCategory = 'All';
  readonly categories = ['All', 'Phones (IMEI)', 'Accessories'];

  barcodeInput = new FormControl('');
  customerSearchQuery = '';
  showCustomerPicker = false;
  selectedCustomer: Customer | null = null;

  // Dynamic Tenant Tax Settings
  taxEnabled = true;
  taxRate = 0.0;
  taxName = 'GST / Sales Tax';
  isTaxInclusive = false;

  // Parked / Held Carts
  parkedSales: ParkedSale[] = [];
  showParkedModal = false;

  // Split Payments State
  showPaymentModal = false;
  splitPayments: SplitPaymentLine[] = [];
  paymentNotes = '';
  dueDate: string | null = null;
  selectedCreditOverrideId: string | null = null;

  // Completed Invoice / Thermal Receipt Modal
  showReceiptModal = false;
  completedSale: SaleSummary | null = null;
  completedItemsSnapshot: CartItem[] = [];
  completedPaymentsSnapshot: SplitPaymentLine[] = [];

  // Quick Customer Registration Modal
  showNewCustomerModal = false;
  newCustomerName = '';
  newCustomerPhone = '';
  newCustomerCnic = '';
  newCustomerEmail = '';
  customerCnicRequiredForCart = false;
  customerErrors: Record<string, string> = {};

  // Discount Request Modal
  showDiscountModal = false;
  discountTargetItem: CartItem | null = null;
  discountRequestedPrice = 0;
  discountReason = '';

  // Credit Override Modal
  showCreditOverrideModal = false;
  creditOverrideReason = '';

  // Approvals Hub Modal (Discounts & Credit Overrides)
  showApprovalsModal = false;
  approvalsTab: 'discounts' | 'credits' = 'discounts';
  allDiscountRequests: DiscountRequest[] = [];
  allCreditOverrides: CreditOverride[] = [];
  isLoadingApprovals = false;
  reviewingApprovalId: string | null = null;

  // Loading States
  isLoadingCatalog = false;
  isProcessingCheckout = false;

  constructor(
    private readonly posService: PosService,
    private readonly customersService: CustomersService,
    private readonly salesService: SalesService,
    private readonly shopService: ShopService,
    private readonly notifications: NotificationsService,
    public readonly authService: AuthService,
    private readonly toast: ToastService
  ) {}

  get isShopAdmin(): boolean {
    return this.authService.currentUser?.role === 'SHOP_ADMIN';
  }

  get cashierName(): string {
    return this.authService.currentUser?.name || 'Staff Cashier';
  }

  get parkedStorageKey(): string {
    return `apex_parked_carts_${this.authService.currentShop?.id || 'default'}`;
  }

  get pendingApprovalsCount(): number {
    const pd = this.allDiscountRequests.filter((d) => d.status === 'PENDING').length;
    const pc = this.allCreditOverrides.filter((c) => c.status === 'PENDING').length;
    return pd + pc;
  }

  get approvedReadyCount(): number {
    const ad = this.allDiscountRequests.filter((d) => d.status === 'APPROVED').length;
    const ac = this.allCreditOverrides.filter((c) => c.status === 'APPROVED').length;
    return ad + ac;
  }

  ngOnInit(): void {
    this.loadTaxSettings();
    this.loadCatalog();
    this.loadCustomers();
    this.loadApprovals();
    this.restoreParkedSales();

    this.sub.add(
      this.barcodeInput.valueChanges
        .pipe(debounceTime(200), distinctUntilChanged())
        .subscribe((term) => {
          this.filterCatalog(term || '');
        })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  @HostListener('window:keydown', ['$event'])
  handlePosShortcuts(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.showReceiptModal) {
        this.showReceiptModal = false;
        return;
      }
      if (this.showPaymentModal) {
        this.showPaymentModal = false;
        return;
      }
      if (this.showDiscountModal) {
        this.showDiscountModal = false;
        return;
      }
      if (this.showNewCustomerModal) {
        this.showNewCustomerModal = false;
        return;
      }
      if (this.showCreditOverrideModal) {
        this.showCreditOverrideModal = false;
        return;
      }
      if (this.showApprovalsModal) {
        this.showApprovalsModal = false;
        return;
      }
      if (this.showParkedModal) {
        this.showParkedModal = false;
        return;
      }
      if (this.showCustomerPicker) {
        this.showCustomerPicker = false;
      }
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      this.scannerInputEl?.nativeElement.focus();
      this.scannerInputEl?.nativeElement.select();
    } else if (event.key === 'F9' && this.cart.length > 0 && !this.showPaymentModal) {
      event.preventDefault();
      this.openPayment();
    } else if (event.altKey && event.key.toLowerCase() === 'h' && this.cart.length > 0) {
      event.preventDefault();
      this.parkCurrentCart();
    }
  }

  loadTaxSettings(): void {
    this.shopService.getTaxSettings().subscribe({
      next: (settings) => {
        this.taxEnabled = settings.taxEnabled;
        this.taxRate = settings.taxEnabled ? settings.taxRate : 0;
        this.taxName = settings.taxName || 'Sales Tax';
        this.isTaxInclusive = settings.isTaxInclusive;
      },
      error: () => {
        this.taxEnabled = false;
        this.taxRate = 0;
      },
    });
  }

  loadCatalog(query?: string): void {
    this.isLoadingCatalog = true;
    this.posService.searchProducts(query).subscribe({
      next: (items) => {
        this.catalogItems = items;
        this.filterCatalog(this.barcodeInput.value || '');
        this.isLoadingCatalog = false;
      },
      error: (err) => {
        this.isLoadingCatalog = false;
        this.toast.error('Failed to load products: ' + (err.error?.message || err.message));
      },
    });
  }

  loadCustomers(): void {
    this.customersService.getCustomers().subscribe({
      next: (custs) => {
        this.customers = custs;
        this.filterCustomers();
        if (this.selectedCustomer) {
          const refreshed = custs.find((c) => c.id === this.selectedCustomer?.id);
          if (refreshed) this.selectedCustomer = refreshed;
        }
      },
      error: () => {},
    });
  }

  loadApprovals(): void {
    this.isLoadingApprovals = true;
    this.posService.getDiscounts().subscribe({
      next: (list) => {
        this.allDiscountRequests = list;
        this.isLoadingApprovals = false;
      },
      error: () => {
        this.isLoadingApprovals = false;
      },
    });
    this.posService.getCreditOverrides().subscribe({
      next: (list) => {
        this.allCreditOverrides = list;
      },
      error: () => {},
    });
  }

  filterCustomers(): void {
    const q = this.customerSearchQuery.trim().toLowerCase();
    if (!q) {
      this.filteredCustomers = this.customers.slice(0, 12);
      return;
    }
    this.filteredCustomers = this.customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q)) ||
          (c.cnicMasked && c.cnicMasked.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }

  getCustomerCreditPct(cust: Customer): number {
    if (!cust.creditLimit || cust.creditLimit <= 0) return 0;
    return Math.min(100, Math.round((cust.outstandingBalance / cust.creditLimit) * 100));
  }

  filterCatalog(term: string): void {
    let list = this.catalogItems;
    if (this.selectedCategory === 'Phones (IMEI)') {
      list = list.filter((i) => i.itemType === 'PHONE');
    } else if (this.selectedCategory === 'Accessories') {
      list = list.filter((i) => i.itemType === 'ACCESSORY');
    }

    if (!term || term.trim() === '') {
      this.filteredCatalog = list;
      return;
    }

    const t = term.toLowerCase().trim();
    this.filteredCatalog = list.filter(
      (i) =>
        i.productName.toLowerCase().includes(t) ||
        i.identifier.toLowerCase().includes(t) ||
        (i.barcode && i.barcode.toLowerCase().includes(t)) ||
        (i.specs && i.specs.toLowerCase().includes(t))
    );
  }

  setCategory(cat: string): void {
    this.selectedCategory = cat;
    this.filterCatalog(this.barcodeInput.value || '');
  }

  getCategoryCount(cat: string): number {
    if (cat === 'All') return this.catalogItems.length;
    if (cat === 'Phones (IMEI)') return this.catalogItems.filter((i) => i.itemType === 'PHONE').length;
    return this.catalogItems.filter((i) => i.itemType === 'ACCESSORY').length;
  }

  isInCart(product: PosProductItem): boolean {
    return this.cart.some((c) => c.productId === product.id);
  }

  onScanEnter(): void {
    const code = (this.barcodeInput.value || '').trim();
    if (!code) return;

    this.posService.scanLookup(code).subscribe({
      next: (item) => {
        const normalized: PosProductItem = {
          ...item,
          defaultPrice: item.defaultPrice ?? (item as any).sellingPrice ?? 0,
        };
        if (normalized.stockQuantity <= 0) {
          this.toast.warning(`${normalized.productName} is currently out of stock.`);
          return;
        }
        this.addToCart(normalized);
        this.barcodeInput.setValue('');
        this.toast.success(`Added ${normalized.productName} to register`);
      },
      error: () => {
        const match = this.catalogItems.find(
          (i) =>
            i.identifier.toLowerCase() === code.toLowerCase() ||
            (i.barcode && i.barcode.toLowerCase() === code.toLowerCase())
        );
        if (match) {
          this.addToCart(match);
          this.barcodeInput.setValue('');
          this.toast.success(`Added ${match.productName} to register`);
        } else if (this.filteredCatalog.length === 1) {
          this.addToCart(this.filteredCatalog[0]);
          this.barcodeInput.setValue('');
          this.toast.success(`Added ${this.filteredCatalog[0].productName} to register`);
        } else {
          this.toast.warning(`No in-stock product found for "${code}"`);
        }
      },
    });
  }

  addToCart(product: PosProductItem): void {
    if (product.itemType === 'PHONE') {
      const existing = this.cart.find((c) => c.productId === product.id);
      if (existing) {
        this.toast.warning(`Serialized phone (${product.identifier}) is already in cart.`);
        return;
      }
    }

    if (product.itemType === 'ACCESSORY') {
      const existing = this.cart.find((c) => c.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.stockQuantity) {
          this.toast.warning(`Cannot exceed available stock (${product.stockQuantity}).`);
          return;
        }
        existing.quantity += 1;
        existing.subtotal = existing.actualPrice * existing.quantity;
        this.checkCnicRequirement();
        return;
      }
    }

    const cartRow: CartItem = {
      id: `cart_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      productId: product.id,
      itemType: product.itemType,
      productName: product.productName,
      identifier: product.identifier,
      imei2: product.imei2,
      specs: product.specs,
      condition: product.condition,
      stockAvailable: product.stockQuantity,
      defaultPrice: product.defaultPrice,
      actualPrice: product.defaultPrice,
      quantity: 1,
      subtotal: product.defaultPrice,
      warrantyMonths: product.itemType === 'PHONE' ? 12 : 0,
    };

    this.cart.push(cartRow);
    this.checkCnicRequirement();
  }

  updateQuantity(index: number, delta: number): void {
    const item = this.cart[index];
    if (item.itemType === 'PHONE') return;

    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      this.removeFromCart(index);
      return;
    }

    if (newQty > item.stockAvailable) {
      this.toast.warning(`Available stock is ${item.stockAvailable}`);
      return;
    }

    item.quantity = newQty;
    item.subtotal = item.actualPrice * item.quantity;
    this.checkCnicRequirement();
  }

  removeFromCart(index: number): void {
    this.cart.splice(index, 1);
    this.checkCnicRequirement();
  }

  clearCart(): void {
    this.cart = [];
    this.selectedCustomer = null;
    this.selectedCreditOverrideId = null;
    this.checkCnicRequirement();
  }

  // Park / Hold Cart Queue
  parkCurrentCart(): void {
    if (this.cart.length === 0) return;
    const parked: ParkedSale = {
      id: `hold_${Date.now()}`,
      label: this.selectedCustomer?.name || `Walk-in (${this.cart.length} item${this.cart.length === 1 ? '' : 's'})`,
      parkedAt: new Date().toISOString(),
      customer: this.selectedCustomer,
      items: [...this.cart],
      total: this.totalPayable,
    };
    this.parkedSales = [parked, ...this.parkedSales].slice(0, 10);
    this.persistParkedSales();
    this.clearCart();
    this.toast.info('Sale Parked', `Held "${parked.label}" ($${parked.total.toFixed(2)}) for later recall.`);
  }

  recallParkedSale(parked: ParkedSale): void {
    if (this.cart.length > 0) {
      this.parkCurrentCart();
    }
    this.cart = parked.items.map((i) => ({ ...i }));
    this.selectedCustomer = parked.customer;
    this.parkedSales = this.parkedSales.filter((p) => p.id !== parked.id);
    this.persistParkedSales();
    this.checkCnicRequirement();
    this.showParkedModal = false;
    this.toast.success('Cart Recalled', `Restored "${parked.label}" into register.`);
  }

  deleteParkedSale(id: string): void {
    this.parkedSales = this.parkedSales.filter((p) => p.id !== id);
    this.persistParkedSales();
  }

  private persistParkedSales(): void {
    try {
      localStorage.setItem(this.parkedStorageKey, JSON.stringify(this.parkedSales));
    } catch {
      // Ignore storage failures
    }
  }

  private restoreParkedSales(): void {
    try {
      const raw = localStorage.getItem(this.parkedStorageKey);
      if (raw) {
        this.parkedSales = JSON.parse(raw);
      }
    } catch {
      this.parkedSales = [];
    }
  }

  checkCnicRequirement(): void {
    this.customerCnicRequiredForCart = this.cart.some((i) => i.itemType === 'PHONE');
  }

  // Price Negotiation & Discount Approval Flow
  openPriceEdit(item: CartItem): void {
    this.discountTargetItem = item;
    this.discountRequestedPrice = item.actualPrice;
    this.discountReason = '';
    this.showDiscountModal = true;
  }

  submitPriceChange(): void {
    if (!this.discountTargetItem) return;
    const item = this.discountTargetItem;
    const reqPrice = Number(this.discountRequestedPrice);

    if (isNaN(reqPrice) || reqPrice < 0) {
      this.toast.error('Please enter a valid price');
      return;
    }

    if (reqPrice >= item.defaultPrice) {
      item.actualPrice = reqPrice;
      item.subtotal = reqPrice * item.quantity;
      item.discountRequestId = null;
      item.discountAmount = 0;
      this.showDiscountModal = false;
      this.toast.success(`Price updated to $${reqPrice.toFixed(2)}`);
      return;
    }

    if (this.isShopAdmin) {
      item.actualPrice = reqPrice;
      item.subtotal = reqPrice * item.quantity;
      item.discountAmount = (item.defaultPrice - reqPrice) * item.quantity;
      this.showDiscountModal = false;
      this.toast.success(`Administrator discount applied ($${item.discountAmount.toFixed(2)} off)`);
      return;
    }

    if (!this.discountReason || this.discountReason.trim().length < 3) {
      this.toast.warning('A reason is mandatory for discount approval request');
      return;
    }

    this.posService
      .requestDiscount({
        itemType: item.itemType,
        productId: item.productId,
        productName: item.productName,
        defaultPrice: item.defaultPrice,
        requestedPrice: reqPrice,
        reason: this.discountReason.trim(),
      })
      .subscribe({
        next: (res) => {
          item.discountRequestId = res.id;
          if (res.status === 'APPROVED') {
            item.actualPrice = reqPrice;
            item.subtotal = reqPrice * item.quantity;
            item.discountAmount = (item.defaultPrice - reqPrice) * item.quantity;
            this.toast.success('Discount approved and applied!');
          } else {
            this.toast.info('Discount request sent to Shop Admin for approval.');
          }
          this.showDiscountModal = false;
          this.loadApprovals();
          this.notifications.refresh();
        },
        error: (err) => {
          this.toast.error('Failed to submit discount request: ' + (err.error?.message || err.message));
        },
      });
  }

  // Approvals Hub Actions
  openApprovalsHub(): void {
    this.showApprovalsModal = true;
    this.loadApprovals();
  }

  reviewDiscount(req: DiscountRequest, action: 'APPROVE' | 'REJECT'): void {
    this.reviewingApprovalId = req.id;
    this.posService.reviewDiscount(req.id, action).subscribe({
      next: () => {
        this.reviewingApprovalId = null;
        this.toast.success(
          action === 'APPROVE' ? 'Discount Approved' : 'Discount Rejected',
          `${req.productName} request ${action === 'APPROVE' ? 'approved' : 'rejected'}.`
        );
        this.loadApprovals();
        this.notifications.refresh();
      },
      error: (err) => {
        this.reviewingApprovalId = null;
        this.toast.error('Review Failed', err?.error?.message || 'Error');
      },
    });
  }

  reviewCreditOverride(ovr: CreditOverride, action: 'APPROVE' | 'REJECT'): void {
    this.reviewingApprovalId = ovr.id;
    this.posService.reviewCreditOverride(ovr.id, action).subscribe({
      next: () => {
        this.reviewingApprovalId = null;
        this.toast.success(
          action === 'APPROVE' ? 'Credit Override Approved' : 'Credit Override Rejected',
          `${ovr.customerName} override updated.`
        );
        this.loadApprovals();
        this.notifications.refresh();
      },
      error: (err) => {
        this.reviewingApprovalId = null;
        this.toast.error('Review Failed', err?.error?.message || 'Error');
      },
    });
  }

  applyApprovedDiscountToCart(req: DiscountRequest): void {
    const cartItem = this.cart.find((c) => c.productId === req.productId);
    if (!cartItem) {
      this.toast.warning('Item Not in Cart', `Add "${req.productName}" to cart first to apply this approved discount.`);
      return;
    }
    const approvedDisc = req.approvedAmount ?? req.discountAmount;
    const newUnitPrice = Math.max(0, Math.round((cartItem.defaultPrice - approvedDisc) * 100) / 100);
    cartItem.actualPrice = newUnitPrice;
    cartItem.subtotal = newUnitPrice * cartItem.quantity;
    cartItem.discountRequestId = req.id;
    cartItem.discountAmount = approvedDisc * cartItem.quantity;
    this.showApprovalsModal = false;
    this.toast.success('Approved Discount Applied', `${cartItem.productName} updated to $${newUnitPrice.toFixed(2)}.`);
  }

  attachApprovedCreditOverride(ovr: CreditOverride): void {
    const cust = this.customers.find((c) => c.id === ovr.customerId);
    if (cust) {
      this.selectedCustomer = cust;
    }
    this.selectedCreditOverrideId = ovr.id;
    this.showApprovalsModal = false;
    this.toast.success('Credit Override Attached', `Authorized override attached for ${ovr.customerName}.`);
  }

  // Calculations (matches BE sales.controller.ts tax math!)
  get subtotal(): number {
    return Math.round(this.cart.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
  }

  get totalDiscount(): number {
    return this.cart.reduce((sum, item) => {
      const perUnitDisc = Math.max(0, item.defaultPrice - item.actualPrice);
      return sum + perUnitDisc * item.quantity;
    }, 0);
  }

  get taxAmount(): number {
    if (!this.taxEnabled || this.taxRate <= 0) return 0;
    if (this.isTaxInclusive) {
      return Math.round((this.subtotal - this.subtotal / (1 + this.taxRate / 100)) * 100) / 100;
    }
    return Math.round(this.subtotal * (this.taxRate / 100) * 100) / 100;
  }

  get totalPayable(): number {
    if (this.isTaxInclusive) {
      return this.subtotal;
    }
    return Math.round((this.subtotal + this.taxAmount) * 100) / 100;
  }

  get totalPaidTendered(): number {
    return Math.round(this.splitPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0) * 100) / 100;
  }

  get remainingBalanceDue(): number {
    return Math.max(0, Math.round((this.totalPayable - this.totalPaidTendered) * 100) / 100);
  }

  get changeDue(): number {
    return Math.max(0, Math.round((this.totalPaidTendered - this.totalPayable) * 100) / 100);
  }

  // Tender Quick Cash Helpers
  applyQuickCash(mode: 'EXACT' | 'ADD_10' | 'ADD_20' | 'ADD_50' | 'ADD_100' | 'ROUND_UP'): void {
    if (this.splitPayments.length === 0) return;
    const first = this.splitPayments[0];
    const current = Number(first.amount || 0);
    if (mode === 'EXACT') first.amount = this.totalPayable;
    else if (mode === 'ADD_10') first.amount = Math.round((current + 10) * 100) / 100;
    else if (mode === 'ADD_20') first.amount = Math.round((current + 20) * 100) / 100;
    else if (mode === 'ADD_50') first.amount = Math.round((current + 50) * 100) / 100;
    else if (mode === 'ADD_100') first.amount = Math.round((current + 100) * 100) / 100;
    else if (mode === 'ROUND_UP') first.amount = Math.ceil(this.totalPayable / 10) * 10;
  }

  // Checkout / Tender Modal
  openPayment(): void {
    if (this.cart.length === 0) return;

    if (this.customerCnicRequiredForCart && !this.selectedCustomer?.hasCnic) {
      this.toast.warning('Mobile phone sale requires a customer with CNIC. Please select or register customer.');
      this.showNewCustomerModal = true;
      return;
    }

    this.splitPayments = [
      {
        id: `pay_${Date.now()}`,
        paymentMethod: 'CASH',
        amount: this.totalPayable,
      },
    ];
    this.paymentNotes = '';
    this.dueDate = null;
    this.showPaymentModal = true;
  }

  addSplitPaymentLine(method: PaymentMethodType = 'CARD'): void {
    const remaining = this.remainingBalanceDue;
    this.splitPayments.push({
      id: `pay_${Date.now()}_${Math.random()}`,
      paymentMethod: method,
      amount: remaining > 0 ? remaining : 0,
    });
  }

  removeSplitPaymentLine(index: number): void {
    if (this.splitPayments.length <= 1) return;
    this.splitPayments.splice(index, 1);
  }

  submitCheckout(): void {
    if (this.cart.length === 0) return;

    const balanceDue = this.remainingBalanceDue;

    if (balanceDue > 0) {
      if (!this.selectedCustomer) {
        this.toast.error('Credit sales require an attached registered customer profile.');
        return;
      }

      const availableCredit = this.selectedCustomer.availableCredit || 0;
      if (balanceDue > availableCredit && !this.isShopAdmin && !this.selectedCreditOverrideId) {
        this.toast.warning(
          `Sale exceeds customer credit limit! Available credit: $${availableCredit.toFixed(2)}, Balance due: $${balanceDue.toFixed(2)}`
        );
        this.showCreditOverrideModal = true;
        return;
      }
    }

    const itemsSnapshot = this.cart.map((c) => ({ ...c }));
    const paymentsSnapshot = this.splitPayments.filter((p) => Number(p.amount) > 0).map((p) => ({ ...p }));

    const payload = {
      customerId: this.selectedCustomer?.id || null,
      customerName: this.selectedCustomer?.name || 'Walk-in Retail Customer',
      customerPhone: this.selectedCustomer?.phone || '',
      customerCnic: '',
      items: this.cart.map((c) => ({
        itemType: c.itemType,
        productId: c.productId,
        quantity: c.quantity,
        actualPrice: c.actualPrice,
        discountRequestId: c.discountRequestId || null,
        warrantyMonths: c.warrantyMonths,
      })),
      payments: paymentsSnapshot.map((p) => ({
        paymentMethod: p.paymentMethod,
        amount: Number(p.amount),
        transactionReference: p.transactionReference || '',
        notes: p.notes || '',
      })),
      dueDate: this.dueDate || null,
      creditOverrideId: this.selectedCreditOverrideId,
      notes: this.paymentNotes,
    };

    this.isProcessingCheckout = true;
    this.posService.checkout(payload).subscribe({
      next: (sale) => {
        this.isProcessingCheckout = false;
        this.showPaymentModal = false;
        this.completedSale = sale;
        this.completedItemsSnapshot = itemsSnapshot;
        this.completedPaymentsSnapshot = paymentsSnapshot;
        this.showReceiptModal = true;
        this.toast.success(`Sale finalized! Invoice ${sale.invoiceNo}`);
        this.cart = [];
        this.selectedCreditOverrideId = null;
        this.checkCnicRequirement();
        this.loadCatalog();
        this.loadCustomers();
        this.loadApprovals();
        this.notifications.refresh();
      },
      error: (err) => {
        this.isProcessingCheckout = false;
        this.toast.error('Checkout failed: ' + (err.error?.message || err.message));
      },
    });
  }

  saveNewCustomer(): void {
    this.customerErrors = {};

    const name = (this.newCustomerName || '').trim();
    if (!name || name.length < 2) {
      this.customerErrors['name'] = 'Customer name must be at least 2 characters.';
    }

    const phone = (this.newCustomerPhone || '').trim();
    if (phone && !isValidPhone(phone)) {
      this.customerErrors['phone'] = 'Please enter a valid phone number.';
    }

    const cnic = (this.newCustomerCnic || '').trim();
    if (this.customerCnicRequiredForCart) {
      if (!cnic || !isValidCnic(cnic)) {
        this.customerErrors['cnic'] = 'A valid 13-digit CNIC is mandatory for mobile phone sales.';
      }
    } else if (cnic && !isValidCnic(cnic)) {
      this.customerErrors['cnic'] = 'CNIC must be a valid 13-digit number.';
    }

    const email = (this.newCustomerEmail || '').trim();
    if (email && !isValidEmail(email)) {
      this.customerErrors['email'] = 'Please enter a valid email address.';
    }

    if (Object.keys(this.customerErrors).length > 0) {
      this.toast.warning('Please correct the highlighted customer fields.');
      return;
    }

    this.customersService
      .createCustomer({ name, phone, cnic, email })
      .subscribe({
        next: (cust) => {
          this.toast.success(`Customer ${cust.name} registered & attached`);
          this.customers.push(cust);
          this.filterCustomers();
          this.selectedCustomer = cust;
          this.showNewCustomerModal = false;
          this.resetNewCustomerForm();
        },
        error: (err) => {
          if (err?.error?.fieldErrors) {
            this.customerErrors = err.error.fieldErrors;
          }
          this.toast.error('Failed to register customer: ' + (err.error?.message || err.message));
        },
      });
  }

  resetNewCustomerForm(): void {
    this.newCustomerName = '';
    this.newCustomerPhone = '';
    this.newCustomerCnic = '';
    this.newCustomerEmail = '';
    this.customerErrors = {};
  }

  selectCustomer(cust: Customer | null): void {
    this.selectedCustomer = cust;
    this.showCustomerPicker = false;
    this.customerSearchQuery = '';
    this.filterCustomers();
  }

  submitCreditOverrideRequest(): void {
    if (!this.selectedCustomer) return;
    if (!this.creditOverrideReason || this.creditOverrideReason.trim().length < 3) {
      this.toast.warning('Reason is mandatory for credit limit override request');
      return;
    }

    this.posService
      .requestCreditOverride({
        customerId: this.selectedCustomer.id,
        saleAmount: this.remainingBalanceDue,
        reason: this.creditOverrideReason.trim(),
      })
      .subscribe({
        next: (ovr) => {
          this.selectedCreditOverrideId = ovr.id;
          if (ovr.status === 'APPROVED') {
            this.toast.success('Credit limit override approved!');
          } else {
            this.toast.info('Credit override request submitted for Admin review.');
          }
          this.showCreditOverrideModal = false;
          this.loadApprovals();
          this.notifications.refresh();
        },
        error: (err) => {
          this.toast.error('Failed to submit credit override: ' + (err.error?.message || err.message));
        },
      });
  }

  printInvoice(): void {
    window.print();
  }

  downloadInvoicePdf(): void {
    if (!this.completedSale) return;
    this.salesService.downloadInvoicePdf(this.completedSale.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.completedSale?.invoiceNo}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        this.toast.error('Failed to download invoice PDF: ' + (err.message || 'Error'));
      },
    });
  }
}
