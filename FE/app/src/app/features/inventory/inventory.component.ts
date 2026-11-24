import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { InventoryService } from '../../core/services/inventory.service';
import { PurchasesService } from '../../core/services/purchases.service';
import { SuppliersService } from '../../core/services/suppliers.service';
import { StockTakingService } from '../../core/services/stock-taking.service';
import {
  AccessoryCategory,
  AccessoryItem,
  PhoneCondition,
  PhoneItem,
  PhoneStockStatus,
  PurchaseRecord,
  StockMovement,
  StockSummary,
  StockTakeItem,
  StockTakeSession,
  SupplierItem,
} from '../../core/models/inventory.models';
import { isValidPhone, isValidEmail } from '../../shared/utils/formatters';

type InventoryTab = 'overview' | 'phones' | 'accessories' | 'purchases' | 'suppliers' | 'adjustments' | 'stock-takes';

@Component({
  selector: 'app-inventory',
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss'],
})
export class InventoryComponent implements OnInit, OnDestroy {
  activeTab: InventoryTab = 'overview';
  private sub = new Subscription();
  private hasLoadedInitialTab = false;

  // Summary & Metrics
  summary: StockSummary | null = null;
  loadingSummary = false;

  // Phones State
  phones: PhoneItem[] = [];
  filteredPhones: PhoneItem[] = [];
  loadingPhones = false;
  phonesError: string | null = null;
  private phoneSub?: Subscription;
  phoneSearch = new FormControl('');
  selectedBrand = 'All';
  selectedCondition = 'All';
  selectedStatus = 'All';
  selectedPhone: PhoneItem | null = null;
  phoneMovements: StockMovement[] = [];
  phoneDrawerOpen = false;

  // Phone Add/Edit Form
  phoneModalOpen = false;
  isEditingPhone = false;
  phoneErrors: Record<string, string> = {};
  accessoryErrors: Record<string, string> = {};
  supplierErrors: Record<string, string> = {};
  adjustmentErrors: Record<string, string> = {};
  phoneForm: {
    id?: string;
    brand: string;
    model: string;
    imei1: string;
    imei2?: string;
    ram: string;
    storage: string;
    color: string;
    condition: PhoneCondition;
    purchase_cost: number;
    selling_price: number;
    supplier_id: string;
    battery_health?: number;
    physical_condition?: string;
    accessories_included?: string;
    status: PhoneStockStatus;
    description?: string;
  } = this.getEmptyPhoneForm();

  // Accessories State
  accessories: AccessoryItem[] = [];
  filteredAccessories: AccessoryItem[] = [];
  categories: AccessoryCategory[] = [];
  loadingAccessories = false;
  accessorySearch = new FormControl('');
  selectedCategory = 'All';
  selectedAccessory: (AccessoryItem & { batches?: any[]; movements?: StockMovement[] }) | null = null;
  accDrawerOpen = false;

  // Accessory Add/Edit Form
  accessoryModalOpen = false;
  isEditingAccessory = false;
  accessoryForm: {
    id?: string;
    name: string;
    categoryId: string;
    supplierId?: string;
    brand: string;
    model?: string;
    sku: string;
    barcode?: string;
    purchaseCost: number;
    sellingPrice: number;
    initialQuantity?: number;
    minStockThreshold: number;
    description?: string;
    status?: 'ACTIVE' | 'INACTIVE';
  } = this.getEmptyAccessoryForm();

  // Purchases State
  purchases: PurchaseRecord[] = [];
  loadingPurchases = false;
  purchaseSearch = new FormControl('');
  selectedPurchaseStatus = 'All';
  selectedPurchase: PurchaseRecord | null = null;
  purchaseModalOpen = false;
  createPoModalOpen = false;

  // Create PO Line Items
  poForm = {
    supplierId: '',
    referenceNo: '',
    purchaseDate: new Date().toISOString().slice(0, 10),
    taxAmount: 0,
    discountAmount: 0,
    notes: '',
    autoConfirm: false,
    items: [] as Array<{
      itemType: 'PHONE' | 'ACCESSORY';
      name: string;
      quantity: number;
      unitCost: number;
      brand?: string;
      model?: string;
      imei1?: string;
      imei2?: string;
      ram?: string;
      storage?: string;
      color?: string;
      condition?: PhoneCondition;
      sellingPrice?: number;
      accessoryId?: string;
      categoryId?: string;
      sku?: string;
      barcode?: string;
    }>,
  };

  // Add Item to PO Form
  newPoItemType: 'PHONE' | 'ACCESSORY' = 'PHONE';
  tempPoItem = {
    itemType: 'PHONE' as 'PHONE' | 'ACCESSORY',
    name: '',
    quantity: 1,
    unitCost: 0,
    brand: 'Apple',
    model: '',
    imei1: '',
    imei2: '',
    ram: '8GB',
    storage: '256GB',
    color: 'Black',
    condition: 'NEW' as PhoneCondition,
    sellingPrice: 0,
    accessoryId: '',
    categoryId: '',
    sku: '',
    barcode: '',
  };

  // Suppliers State
  suppliers: SupplierItem[] = [];
  loadingSuppliers = false;
  supplierSearch = new FormControl('');
  selectedSupplierStatus = 'All';
  supplierModalOpen = false;
  isEditingSupplier = false;
  supplierForm = {
    id: '',
    name: '',
    contactPerson: '',
    phone: '',
    email: '',
    address: '',
    businessId: '',
    notes: '',
  };

  // Stock Movements & Adjustments State
  movements: StockMovement[] = [];
  loadingMovements = false;
  movementSearch = new FormControl('');
  selectedMovementType = 'All';
  selectedMovementItemType = 'All';
  adjustmentModalOpen = false;
  adjustmentForm = {
    itemType: 'ACCESSORY' as 'PHONE' | 'ACCESSORY',
    productId: '',
    newQuantity: 0,
    newStatus: 'IN_STOCK' as PhoneStockStatus,
    reason: '',
  };

  // Physical Stock-Taking State
  stockTakes: StockTakeSession[] = [];
  loadingStockTakes = false;
  activeStockTake: (StockTakeSession & { items: StockTakeItem[] }) | null = null;
  stockTakeModalOpen = false;
  stockTakeCountModalOpen = false;
  stockTakeForm = {
    title: '',
    notes: '',
    scope: 'ALL' as 'ALL' | 'PHONES_ONLY' | 'ACCESSORIES_ONLY',
  };

  // Quick lookup IMEI
  imeiLookupInput = '';
  imeiLookupLoading = false;
  showLowStockOnly = false;
  printingLabelId: string | null = null;

  // Enterprise Confirm Dialog state (replaces window.confirm)
  confirmDialogOpen = false;
  confirmDialogTitle = '';
  confirmDialogMessage = '';
  confirmDialogConfirmText = 'Confirm';
  confirmDialogDestructive = false;
  private confirmDialogAction: (() => void) | null = null;

  constructor(
    private readonly inventoryService: InventoryService,
    private readonly purchasesService: PurchasesService,
    private readonly suppliersService: SuppliersService,
    private readonly stockTakingService: StockTakingService,
    public readonly auth: AuthService,
    public readonly toast: ToastService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Sync tab from active URL route on load
    this.syncTabFromUrl();

    // Listen to route URL changes
    this.sub.add(
      this.route.url.subscribe(() => {
        this.syncTabFromUrl();
      })
    );

    // Listen to router navigation events for browser back/forward and deep-linking
    this.sub.add(
      this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe(() => {
          this.syncTabFromUrl();
        })
    );

    // Reactive search listeners
    this.sub.add(
      this.phoneSearch.valueChanges.pipe(debounceTime(250), distinctUntilChanged()).subscribe(() => {
        this.applyPhoneFilters();
      })
    );

    this.sub.add(
      this.accessorySearch.valueChanges.pipe(debounceTime(250), distinctUntilChanged()).subscribe(() => {
        this.applyAccessoryFilters();
      })
    );

    this.sub.add(
      this.movementSearch.valueChanges.pipe(debounceTime(250), distinctUntilChanged()).subscribe(() => {
        this.loadMovements();
      })
    );

    // Listen to query params (e.g. deep-linking from Global Search)
    this.sub.add(
      this.route.queryParams.subscribe((params) => {
        const query = params['search'];
        if (query) {
          if (this.activeTab === 'phones') {
            this.phoneSearch.setValue(query);
          } else if (this.activeTab === 'accessories') {
            this.accessorySearch.setValue(query);
          } else if (this.activeTab === 'suppliers') {
            this.supplierSearch.setValue(query);
          }
        }
      })
    );

    // Preload phone inventory if on overview/other tabs so badge count & first-visit data are ready
    if (this.activeTab !== 'phones' && this.canViewPhones) {
      this.loadPhones();
    }

    // Initial preload of categories & suppliers
    if (this.canViewAccessories) {
      this.inventoryService.getCategories().subscribe({
        next: (cats) => (this.categories = cats),
        error: () => {},
      });
    }

    if (this.canViewSuppliers) {
      this.suppliersService.getSuppliers().subscribe({
        next: (sups) => (this.suppliers = sups),
        error: () => {},
      });
    }
  }

  get canViewOverview(): boolean {
    return this.auth.isAdmin() || this.auth.hasPermission('inventory.view');
  }

  get canViewPhones(): boolean {
    return this.auth.isAdmin() || this.auth.hasPermission('phones.view');
  }

  get canViewAccessories(): boolean {
    return this.auth.isAdmin() || this.auth.hasPermission('accessories.view');
  }

  get canViewPurchases(): boolean {
    return this.auth.isAdmin() || this.auth.hasPermission('purchases.view');
  }

  get canViewSuppliers(): boolean {
    return this.auth.isAdmin() || this.auth.hasPermission('suppliers.view');
  }

  get canViewAdjustments(): boolean {
    return this.auth.isAdmin() || this.auth.hasPermission('inventory.view');
  }

  get canViewStockTakes(): boolean {
    return this.auth.isAdmin() || this.auth.hasPermission('inventory.view');
  }

  isTabPermitted(tab: InventoryTab): boolean {
    switch (tab) {
      case 'overview':
        return this.canViewOverview;
      case 'phones':
        return this.canViewPhones;
      case 'accessories':
        return this.canViewAccessories;
      case 'purchases':
        return this.canViewPurchases;
      case 'suppliers':
        return this.canViewSuppliers;
      case 'adjustments':
        return this.canViewAdjustments;
      case 'stock-takes':
        return this.canViewStockTakes;
      default:
        return false;
    }
  }

  getFirstPermittedTab(): InventoryTab | null {
    const tabs: InventoryTab[] = [
      'overview',
      'phones',
      'accessories',
      'purchases',
      'suppliers',
      'adjustments',
      'stock-takes',
    ];
    for (const tab of tabs) {
      if (this.isTabPermitted(tab)) {
        return tab;
      }
    }
    return null;
  }

  ngOnDestroy(): void {
    this.phoneSub?.unsubscribe();
    this.sub.unsubscribe();
  }

  @HostListener('window:keydown.escape')
  handleEscape(): void {
    if (this.phoneDrawerOpen) {
      this.closePhoneDrawer();
      return;
    }
    if (this.accDrawerOpen) {
      this.closeAccDrawer();
      return;
    }
    if (this.stockTakeCountModalOpen) {
      this.stockTakeCountModalOpen = false;
      return;
    }
    if (this.stockTakeModalOpen) {
      this.stockTakeModalOpen = false;
      return;
    }
    if (this.adjustmentModalOpen) {
      this.adjustmentModalOpen = false;
      return;
    }
    if (this.createPoModalOpen) {
      this.createPoModalOpen = false;
      return;
    }
    if (this.purchaseModalOpen) {
      this.purchaseModalOpen = false;
      return;
    }
    if (this.supplierModalOpen) {
      this.supplierModalOpen = false;
      return;
    }
    if (this.accessoryModalOpen) {
      this.accessoryModalOpen = false;
      return;
    }
    if (this.phoneModalOpen) {
      this.phoneModalOpen = false;
    }
  }

  private syncTabFromUrl(): void {
    const validTabs: InventoryTab[] = [
      'overview',
      'phones',
      'accessories',
      'purchases',
      'suppliers',
      'adjustments',
      'stock-takes',
    ];

    let detectedTab: InventoryTab | null = null;
    if (this.route.snapshot.url.length > 0) {
      const seg = this.route.snapshot.url[0].path as InventoryTab;
      if (validTabs.includes(seg)) {
        detectedTab = seg;
      }
    }

    if (!detectedTab) {
      const match = this.router.url.match(/\/inventory\/([a-z-]+)/);
      if (match && validTabs.includes(match[1] as InventoryTab)) {
        detectedTab = match[1] as InventoryTab;
      }
    }

    const targetTab = detectedTab || 'overview';

    // Verify user authorization for target tab
    if (!this.isTabPermitted(targetTab)) {
      const fallbackTab = this.getFirstPermittedTab();
      if (fallbackTab) {
        if (detectedTab) {
          this.toast.error(`Access restricted for ${targetTab}. Redirecting to ${fallbackTab}.`);
        }
        this.router.navigate(['/inventory', fallbackTab], { replaceUrl: true });
        return;
      } else {
        this.toast.error('Access denied: You do not have permission to view inventory modules.');
        this.router.navigate(['/dashboard'], { replaceUrl: true });
        return;
      }
    }

    if (this.activeTab !== targetTab || !this.hasLoadedInitialTab) {
      this.activeTab = targetTab;
      this.hasLoadedInitialTab = true;
      this.loadActiveTabData();
    }
  }

  setTab(tab: InventoryTab, event?: Event): void {
    if (event) {
      event.preventDefault();
    }
    if (!this.isTabPermitted(tab)) {
      this.toast.error('You do not have permission to access this section.');
      return;
    }
    if (this.activeTab !== tab) {
      this.activeTab = tab;
      this.router.navigate(['/inventory', tab]);
      this.loadActiveTabData();
    }
  }

  loadActiveTabData(): void {
    switch (this.activeTab) {
      case 'overview':
        if (this.canViewOverview) this.loadSummary();
        break;
      case 'phones':
        if (this.canViewPhones) this.loadPhones();
        break;
      case 'accessories':
        if (this.canViewAccessories) this.loadAccessories();
        break;
      case 'purchases':
        if (this.canViewPurchases) this.loadPurchases();
        break;
      case 'suppliers':
        if (this.canViewSuppliers) this.loadSuppliers();
        break;
      case 'adjustments':
        if (this.canViewAdjustments) this.loadMovements();
        break;
      case 'stock-takes':
        if (this.canViewStockTakes) this.loadStockTakes();
        break;
    }
  }

  // --- 1. Summary ---
  loadSummary(): void {
    this.loadingSummary = true;
    this.inventoryService.getStockSummary().subscribe({
      next: (data) => {
        this.summary = data;
        this.loadingSummary = false;
      },
      error: (err) => {
        this.loadingSummary = false;
        this.toast.error('Failed to load inventory valuation', err?.error?.message || 'Server error');
      },
    });
  }

  // --- 2. Phones Management ---
  loadPhones(): void {
    this.loadingPhones = true;
    this.phonesError = null;

    if (this.phoneSub) {
      this.phoneSub.unsubscribe();
    }

    this.phoneSub = this.inventoryService.getPhones().subscribe({
      next: (res) => {
        this.phones = res.phones || [];
        this.applyPhoneFilters();
        this.loadingPhones = false;
        this.phonesError = null;
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.loadingPhones = false;
        this.phonesError = err?.error?.message || 'Failed to load phone inventory. Please try again.';
        this.toast.error('Failed to load phones', this.phonesError || undefined);
        this.cdr.markForCheck();
      },
    });
    this.sub.add(this.phoneSub);
  }

  applyPhoneFilters(): void {
    const term = (this.phoneSearch.value || '').trim().toLowerCase();
    const brandFilter = (this.selectedBrand || 'All').trim().toLowerCase();
    const condFilter = (this.selectedCondition || 'All').trim().toUpperCase();
    const statusFilter = (this.selectedStatus || 'All').trim().toUpperCase();

    this.filteredPhones = (this.phones || []).filter((p) => {
      if (!p) return false;

      const matchSearch =
        !term ||
        (p.model && p.model.toLowerCase().includes(term)) ||
        (p.brand && p.brand.toLowerCase().includes(term)) ||
        (p.imei1 && String(p.imei1).toLowerCase().includes(term)) ||
        (p.imei2 && String(p.imei2).toLowerCase().includes(term)) ||
        (p.color && p.color.toLowerCase().includes(term)) ||
        (p.storage && p.storage.toLowerCase().includes(term));

      const matchBrand =
        brandFilter === 'all' ||
        brandFilter === '' ||
        (p.brand && p.brand.toLowerCase() === brandFilter);

      const matchCondition =
        condFilter === 'ALL' ||
        condFilter === '' ||
        (p.condition && String(p.condition).toUpperCase() === condFilter);

      const matchStatus =
        statusFilter === 'ALL' ||
        statusFilter === '' ||
        (p.status && String(p.status).toUpperCase() === statusFilter);

      return Boolean(matchSearch && matchBrand && matchCondition && matchStatus);
    });
    this.cdr.markForCheck();
  }

  openAddPhone(): void {
    this.isEditingPhone = false;
    this.phoneForm = this.getEmptyPhoneForm();
    this.phoneErrors = {};
    this.phoneModalOpen = true;
  }

  openEditPhone(phone: PhoneItem): void {
    this.isEditingPhone = true;
    this.phoneForm = {
      id: phone.id,
      brand: phone.brand,
      model: phone.model,
      imei1: phone.imei1,
      imei2: phone.imei2 || '',
      ram: phone.ram || '8GB',
      storage: phone.storage || '256GB',
      color: phone.color || 'Black',
      condition: phone.condition,
      purchase_cost: phone.purchase_cost ?? phone.purchasePrice ?? 0,
      selling_price: phone.selling_price ?? phone.sellingPrice ?? 0,
      supplier_id: phone.supplier_id || '',
      battery_health: phone.battery_health || undefined,
      physical_condition: phone.physical_condition || '',
      accessories_included: phone.accessories_included || '',
      status: phone.status,
      description: phone.description || '',
    };
    this.phoneErrors = {};
    this.phoneModalOpen = true;
  }

  savePhone(): void {
    this.phoneErrors = {};

    const brand = (this.phoneForm.brand || '').trim();
    if (!brand) {
      this.phoneErrors['brand'] = 'Please enter a brand name.';
    }

    const model = (this.phoneForm.model || '').trim();
    if (!model) {
      this.phoneErrors['model'] = 'Please enter a phone model.';
    }

    const imei = (this.phoneForm.imei1 || '').trim();
    if (!imei || imei.length < 8) {
      this.phoneErrors['imei1'] = 'Please enter a valid IMEI number (at least 8 characters).';
    }

    const cost = Number(this.phoneForm.purchase_cost);
    if (isNaN(cost) || cost < 0) {
      this.phoneErrors['purchase_cost'] = 'Purchase cost cannot be negative.';
    }

    const price = Number(this.phoneForm.selling_price);
    if (isNaN(price) || price < 0) {
      this.phoneErrors['selling_price'] = 'Selling price cannot be negative.';
    }

    if (
      this.phoneForm.battery_health !== undefined &&
      this.phoneForm.battery_health !== null &&
      String(this.phoneForm.battery_health).trim() !== ''
    ) {
      const bh = Number(this.phoneForm.battery_health);
      if (isNaN(bh) || bh < 0 || bh > 100) {
        this.phoneErrors['battery_health'] = 'Battery health must be between 0 and 100.';
      }
    }

    if (Object.keys(this.phoneErrors).length > 0) {
      this.toast.warning('Please correct the highlighted phone fields.');
      return;
    }

    const payload = {
      brand,
      model,
      imei1: imei,
      imei2: this.phoneForm.imei2?.trim() || null,
      ram: this.phoneForm.ram?.trim() || null,
      storage: this.phoneForm.storage?.trim() || null,
      color: this.phoneForm.color?.trim() || null,
      condition: this.phoneForm.condition,
      purchaseCost: cost || 0,
      purchase_cost: cost || 0,
      sellingPrice: price || 0,
      selling_price: price || 0,
      supplierId: this.phoneForm.supplier_id && this.phoneForm.supplier_id.trim() !== '' ? this.phoneForm.supplier_id.trim() : null,
      supplier_id: this.phoneForm.supplier_id && this.phoneForm.supplier_id.trim() !== '' ? this.phoneForm.supplier_id.trim() : null,
      batteryHealth: this.phoneForm.battery_health !== undefined && this.phoneForm.battery_health !== null && String(this.phoneForm.battery_health).trim() !== ''
        ? Number(this.phoneForm.battery_health)
        : (this.phoneForm.condition === 'NEW' ? 100 : null),
      battery_health: this.phoneForm.battery_health !== undefined && this.phoneForm.battery_health !== null && String(this.phoneForm.battery_health).trim() !== ''
        ? Number(this.phoneForm.battery_health)
        : (this.phoneForm.condition === 'NEW' ? 100 : null),
      physicalCondition: this.phoneForm.physical_condition?.trim() || null,
      physical_condition: this.phoneForm.physical_condition?.trim() || null,
      accessoriesIncluded: this.phoneForm.accessories_included?.trim() || null,
      accessories_included: this.phoneForm.accessories_included?.trim() || null,
      status: this.phoneForm.status || 'IN_STOCK',
      description: this.phoneForm.description?.trim() || null,
    };

    if (this.isEditingPhone && this.phoneForm.id) {
      this.inventoryService.updatePhone(this.phoneForm.id, payload as any).subscribe({
        next: (updated) => {
          this.toast.success('Phone Updated', `${updated.brand} ${updated.model} (${updated.imei1}) saved.`);
          this.phoneModalOpen = false;
          this.loadPhones();
          if (this.selectedPhone?.id === updated.id) {
            this.inspectPhone(updated.id);
          }
        },
        error: (err) => {
          if (err?.error?.fieldErrors) {
            this.phoneErrors = err.error.fieldErrors;
          }
          this.toast.error('Update Failed', err?.error?.message || err?.message || 'Could not update phone.');
        },
      });
    } else {
      this.inventoryService.createPhone(payload as any).subscribe({
        next: (created) => {
          this.toast.success('Device Registered', `${created.brand} ${created.model} (${created.imei1}) in stock.`);
          this.phoneModalOpen = false;
          this.loadPhones();
        },
        error: (err) => {
          if (err?.error?.fieldErrors) {
            this.phoneErrors = err.error.fieldErrors;
          }
          this.toast.error('Registration Failed', err?.error?.message || err?.message || 'Could not register phone.');
        },
      });
    }
  }

  inspectPhone(id: string): void {
    this.inventoryService.getPhone(id).subscribe({
      next: (res) => {
        this.selectedPhone = res.phone;
        this.phoneMovements = res.movements;
        this.phoneDrawerOpen = true;
      },
      error: (err) => {
        this.toast.error('Failed to load phone details', err?.error?.message || 'Error');
      },
    });
  }

  closePhoneDrawer(): void {
    this.phoneDrawerOpen = false;
    this.selectedPhone = null;
  }

  performImeiLookup(): void {
    const imei = this.imeiLookupInput.trim();
    if (!imei) return;
    this.imeiLookupLoading = true;
    this.inventoryService.lookupImei(imei).subscribe({
      next: (phone) => {
        this.imeiLookupLoading = false;
        this.inspectPhone(phone.id);
        this.toast.success('Device Located', `Found ${phone.brand} ${phone.model} (${phone.status})`);
      },
      error: (err) => {
        this.imeiLookupLoading = false;
        this.toast.error('Device Not Found', err?.error?.message || `No device matching IMEI "${imei}"`);
      },
    });
  }

  private getEmptyPhoneForm() {
    return {
      brand: 'Apple',
      model: '',
      imei1: '',
      imei2: '',
      ram: '8GB',
      storage: '256GB',
      color: 'Titanium',
      condition: 'NEW' as PhoneCondition,
      purchase_cost: 0,
      selling_price: 0,
      supplier_id: '',
      battery_health: 100,
      physical_condition: '',
      accessories_included: '',
      status: 'IN_STOCK' as PhoneStockStatus,
      description: '',
    };
  }

  // --- 3. Accessories Management ---
  loadAccessories(): void {
    this.loadingAccessories = true;
    this.inventoryService
      .getAccessories({
        categoryId: this.selectedCategory,
        search: this.accessorySearch.value || undefined,
      })
      .subscribe({
        next: (res) => {
          this.accessories = res.accessories;
          this.applyAccessoryFilters();
          this.loadingAccessories = false;
        },
        error: (err) => {
          this.loadingAccessories = false;
          this.toast.error('Failed to load accessories', err?.error?.message || 'Server error');
        },
      });
  }

  get availableBrands(): string[] {
    const set = new Set<string>(['Apple', 'Samsung', 'Google', 'Xiaomi', 'OnePlus']);
    for (const p of this.phones || []) {
      if (p?.brand?.trim()) set.add(p.brand.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  get stockTakeVerifiedCount(): number {
    if (!this.activeStockTake?.items) return 0;
    return this.activeStockTake.items.filter((i) => !!i.verified).length;
  }

  get stockTakeDiscrepancyCount(): number {
    if (!this.activeStockTake?.items) return 0;
    return this.activeStockTake.items.filter((i) => i.discrepancy !== 0).length;
  }

  get stockTakeProgressPct(): number {
    const total = this.activeStockTake?.items?.length || 0;
    if (total === 0) return 0;
    return Math.round((this.stockTakeVerifiedCount / total) * 100);
  }

  copyIdentifier(value: string, label = 'IMEI'): void {
    navigator.clipboard?.writeText(value);
    this.toast.success('Copied', `${label}: ${value}`);
  }

  printBarcodeLabel(itemType: 'PHONE' | 'ACCESSORY', id: string, identifier?: string | null): void {
    if (this.printingLabelId) return;
    this.printingLabelId = id;
    this.inventoryService.generateLabelPdf(itemType, id).subscribe({
      next: (blob) => {
        this.printingLabelId = null;
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `label-${identifier || id}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success('Label PDF Ready', `Downloaded thermal barcode label for ${identifier || id}.`);
      },
      error: (err) => {
        this.printingLabelId = null;
        this.toast.error('Label Generation Failed', err?.error?.message || 'Unable to generate barcode label PDF.');
      },
    });
  }

  openConfirm(title: string, message: string, confirmText: string, destructive: boolean, action: () => void): void {
    this.confirmDialogTitle = title;
    this.confirmDialogMessage = message;
    this.confirmDialogConfirmText = confirmText;
    this.confirmDialogDestructive = destructive;
    this.confirmDialogAction = action;
    this.confirmDialogOpen = true;
  }

  handleConfirmAccepted(): void {
    const fn = this.confirmDialogAction;
    this.confirmDialogOpen = false;
    this.confirmDialogAction = null;
    if (fn) fn();
  }

  handleConfirmCancelled(): void {
    this.confirmDialogOpen = false;
    this.confirmDialogAction = null;
  }

  applyAccessoryFilters(): void {
    const term = (this.accessorySearch.value || '').trim().toLowerCase();
    this.filteredAccessories = this.accessories.filter((a) => {
      const matchSearch =
        !term ||
        a.name.toLowerCase().includes(term) ||
        a.sku.toLowerCase().includes(term) ||
        (a.barcode && a.barcode.toLowerCase().includes(term)) ||
        a.brand.toLowerCase().includes(term);

      const matchCat = this.selectedCategory === 'All' || a.category_id === this.selectedCategory;
      const isLow = (a.available_quantity ?? 0) <= (a.min_stock_threshold ?? 5);
      const matchLow = !this.showLowStockOnly || isLow;

      return matchSearch && matchCat && matchLow;
    });
  }

  openAddAccessory(): void {
    this.isEditingAccessory = false;
    this.accessoryForm = this.getEmptyAccessoryForm();
    if (this.categories.length > 0) {
      this.accessoryForm.categoryId = this.categories[0].id;
    }
    this.accessoryErrors = {};
    this.accessoryModalOpen = true;
  }

  openEditAccessory(acc: AccessoryItem): void {
    this.isEditingAccessory = true;
    this.accessoryForm = {
      id: acc.id,
      name: acc.name,
      categoryId: acc.category_id || '',
      supplierId: acc.supplier_id || undefined,
      brand: acc.brand,
      model: acc.model || '',
      sku: acc.sku,
      barcode: acc.barcode || '',
      purchaseCost: acc.purchase_cost || 0,
      sellingPrice: acc.selling_price || 0,
      minStockThreshold: acc.min_stock_threshold || 5,
      description: acc.description || '',
      status: acc.status,
    };
    this.accessoryErrors = {};
    this.accessoryModalOpen = true;
  }

  saveAccessory(): void {
    this.accessoryErrors = {};

    const name = (this.accessoryForm.name || '').trim();
    if (!name || name.length < 2) {
      this.accessoryErrors['name'] = 'Please enter an accessory name (at least 2 characters).';
    }

    if (!this.accessoryForm.categoryId) {
      this.accessoryErrors['categoryId'] = 'Please select a category.';
    }

    const sku = (this.accessoryForm.sku || '').trim();
    if (!sku || sku.length < 2) {
      this.accessoryErrors['sku'] = 'Please enter a unique SKU code (at least 2 characters).';
    }

    const cost = Number(this.accessoryForm.purchaseCost);
    if (isNaN(cost) || cost < 0) {
      this.accessoryErrors['purchaseCost'] = 'Purchase cost cannot be negative.';
    }

    const price = Number(this.accessoryForm.sellingPrice);
    if (isNaN(price) || price < 0) {
      this.accessoryErrors['sellingPrice'] = 'Price cannot be negative.';
    }

    const minStock = Number(this.accessoryForm.minStockThreshold);
    if (isNaN(minStock) || minStock < 0) {
      this.accessoryErrors['minStockThreshold'] = 'Minimum stock threshold cannot be negative.';
    }

    if (Object.keys(this.accessoryErrors).length > 0) {
      this.toast.warning('Please correct the highlighted accessory fields.');
      return;
    }

    if (this.isEditingAccessory && this.accessoryForm.id) {
      this.inventoryService.updateAccessory(this.accessoryForm.id, this.accessoryForm).subscribe({
        next: (updated) => {
          this.toast.success('Accessory Updated', `${updated.name} (${updated.sku}) updated.`);
          this.accessoryModalOpen = false;
          this.loadAccessories();
        },
        error: (err) => {
          if (err?.error?.fieldErrors) {
            this.accessoryErrors = err.error.fieldErrors;
          }
          this.toast.error('Update Failed', err?.error?.message || err?.message || 'Could not update accessory.');
        },
      });
    } else {
      this.inventoryService.createAccessory(this.accessoryForm).subscribe({
        next: (created) => {
          this.toast.success('Accessory Created', `${created.name} (${created.available_quantity} units) registered.`);
          this.accessoryModalOpen = false;
          this.loadAccessories();
        },
        error: (err) => {
          if (err?.error?.fieldErrors) {
            this.accessoryErrors = err.error.fieldErrors;
          }
          this.toast.error('Registration Failed', err?.error?.message || err?.message || 'Could not create accessory.');
        },
      });
    }
  }

  inspectAccessory(id: string): void {
    this.inventoryService.getAccessory(id).subscribe({
      next: (res) => {
        this.selectedAccessory = res;
        this.accDrawerOpen = true;
      },
      error: (err) => {
        this.toast.error('Failed to load accessory details', err?.error?.message || 'Error');
      },
    });
  }

  closeAccDrawer(): void {
    this.accDrawerOpen = false;
    this.selectedAccessory = null;
  }

  private getEmptyAccessoryForm() {
    return {
      name: '',
      categoryId: '',
      supplierId: '',
      brand: 'Anker',
      model: '',
      sku: '',
      barcode: '',
      purchaseCost: 10,
      sellingPrice: 19.99,
      initialQuantity: 10,
      minStockThreshold: 5,
      description: '',
      status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
    };
  }

  // --- 4. Purchases & Multi-Product Inward Intake ---
  loadPurchases(): void {
    this.loadingPurchases = true;
    this.purchasesService
      .getPurchases({
        status: this.selectedPurchaseStatus,
        search: this.purchaseSearch.value || undefined,
      })
      .subscribe({
        next: (data) => {
          this.purchases = data;
          this.loadingPurchases = false;
        },
        error: (err) => {
          this.loadingPurchases = false;
          this.toast.error('Failed to load purchases', err?.error?.message || 'Server error');
        },
      });
  }

  openCreatePo(): void {
    this.poForm = {
      supplierId: this.suppliers.length > 0 ? this.suppliers[0].id : '',
      referenceNo: `PO-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      purchaseDate: new Date().toISOString().slice(0, 10),
      taxAmount: 0,
      discountAmount: 0,
      notes: '',
      autoConfirm: false,
      items: [],
    };
    this.resetTempPoItem();
    this.createPoModalOpen = true;
  }

  resetTempPoItem(): void {
    this.tempPoItem = {
      itemType: this.newPoItemType,
      name: '',
      quantity: 1,
      unitCost: 0,
      brand: 'Apple',
      model: '',
      imei1: '',
      imei2: '',
      ram: '8GB',
      storage: '256GB',
      color: 'Black',
      condition: 'NEW',
      sellingPrice: 0,
      accessoryId: this.accessories.length > 0 ? this.accessories[0].id : '',
      categoryId: this.categories.length > 0 ? this.categories[0].id : '',
      sku: '',
      barcode: '',
    };
  }

  onPoItemTypeChange(): void {
    this.tempPoItem.itemType = this.newPoItemType;
    if (this.newPoItemType === 'ACCESSORY') {
      this.tempPoItem.quantity = 10;
      this.tempPoItem.unitCost = 15;
    } else {
      this.tempPoItem.quantity = 1;
      this.tempPoItem.unitCost = 600;
      this.tempPoItem.sellingPrice = 800;
    }
  }

  onAccessorySelectInPo(): void {
    const acc = this.accessories.find((a) => a.id === this.tempPoItem.accessoryId);
    if (acc) {
      this.tempPoItem.name = acc.name;
      this.tempPoItem.sku = acc.sku;
      this.tempPoItem.unitCost = acc.purchase_cost ?? acc.purchasePrice ?? 0;
    }
  }

  addItemToPo(): void {
    if (this.tempPoItem.itemType === 'PHONE') {
      if (!this.tempPoItem.brand || !this.tempPoItem.model || !this.tempPoItem.imei1) {
        this.toast.error('Validation Error', 'Phone Brand, Model, and IMEI1 are required.');
        return;
      }
      this.poForm.items.push({
        itemType: 'PHONE',
        name: `${this.tempPoItem.brand} ${this.tempPoItem.model}`,
        brand: this.tempPoItem.brand,
        model: this.tempPoItem.model,
        imei1: this.tempPoItem.imei1.trim(),
        imei2: this.tempPoItem.imei2?.trim() || undefined,
        ram: this.tempPoItem.ram,
        storage: this.tempPoItem.storage,
        color: this.tempPoItem.color,
        condition: this.tempPoItem.condition,
        quantity: 1,
        unitCost: Number(this.tempPoItem.unitCost),
        sellingPrice: Number(this.tempPoItem.sellingPrice),
      });
      this.toast.success('Phone Added to PO', `${this.tempPoItem.brand} ${this.tempPoItem.model} added.`);
      this.resetTempPoItem();
    } else {
      let accName = this.tempPoItem.name;
      let sku = this.tempPoItem.sku;
      if (this.tempPoItem.accessoryId) {
        const acc = this.accessories.find((a) => a.id === this.tempPoItem.accessoryId);
        if (acc) {
          accName = acc.name;
          sku = acc.sku;
        }
      }

      if (!accName || Number(this.tempPoItem.quantity) < 1) {
        this.toast.error('Validation Error', 'Accessory name and valid quantity are required.');
        return;
      }

      this.poForm.items.push({
        itemType: 'ACCESSORY',
        name: accName,
        accessoryId: this.tempPoItem.accessoryId || undefined,
        categoryId: this.tempPoItem.categoryId || undefined,
        sku: sku || undefined,
        barcode: this.tempPoItem.barcode || undefined,
        quantity: Number(this.tempPoItem.quantity),
        unitCost: Number(this.tempPoItem.unitCost),
      });
      this.toast.success('Accessory Line Added', `${accName} (${this.tempPoItem.quantity} units) added.`);
      this.resetTempPoItem();
    }
  }

  removePoItem(index: number): void {
    this.poForm.items.splice(index, 1);
  }

  calculatePoTotal(): number {
    const subtotal = this.poForm.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    return Math.max(0, subtotal + Number(this.poForm.taxAmount || 0) - Number(this.poForm.discountAmount || 0));
  }

  submitPurchaseOrder(): void {
    if (!this.poForm.supplierId) {
      this.toast.error('Validation Error', 'Please select a supplier.');
      return;
    }
    if (!this.poForm.referenceNo) {
      this.toast.error('Validation Error', 'Purchase order / invoice reference is required.');
      return;
    }
    if (this.poForm.items.length === 0) {
      this.toast.error('Validation Error', 'Add at least one phone or accessory to this purchase order.');
      return;
    }

    this.purchasesService.createPurchase(this.poForm).subscribe({
      next: (created) => {
        this.toast.success('Purchase Order Created', `Reference: ${created.referenceNo} (${created.status})`);
        this.createPoModalOpen = false;
        this.loadPurchases();
      },
      error: (err) => {
        this.toast.error('Purchase Creation Failed', err?.error?.message || 'Server error');
      },
    });
  }

  confirmPurchase(id: string, refNo: string): void {
    this.openConfirm(
      `Confirm Purchase Order ${refNo}`,
      'This will atomically intake all serialized phones into stock, increment accessory inventory, and generate chronological FIFO cost batches.',
      'Confirm & Intake Stock',
      false,
      () => {
        this.purchasesService.confirmPurchase(id).subscribe({
          next: () => {
            this.toast.success('Purchase Confirmed', `PO ${refNo} received. Inventory and FIFO batches updated.`);
            this.purchaseModalOpen = false;
            this.loadPurchases();
            if (this.canViewPhones) this.loadPhones();
            if (this.canViewAccessories) this.loadAccessories();
          },
          error: (err) => {
            this.toast.error('Confirmation Failed', err?.error?.message || 'Server error');
          },
        });
      }
    );
  }

  viewPurchaseDetail(id: string): void {
    this.purchasesService.getPurchase(id).subscribe({
      next: (data) => {
        this.selectedPurchase = data;
        this.purchaseModalOpen = true;
      },
      error: (err) => {
        this.toast.error('Failed to load purchase details', err?.error?.message || 'Error');
      },
    });
  }

  getPoLineUnitCost(item: any): number {
    return Number(item?.unitCost ?? item?.unit_cost ?? 0);
  }

  getPoLineTotal(item: any): number {
    if (item?.total_cost !== undefined && item?.total_cost !== null) {
      return Number(item.total_cost);
    }
    return Number(item?.quantity || 0) * this.getPoLineUnitCost(item);
  }

  // --- 5. Suppliers Management ---
  loadSuppliers(): void {
    this.loadingSuppliers = true;
    this.suppliersService
      .getSuppliers({
        status: this.selectedSupplierStatus,
        search: this.supplierSearch.value || undefined,
      })
      .subscribe({
        next: (data) => {
          this.suppliers = data;
          this.loadingSuppliers = false;
        },
        error: (err) => {
          this.loadingSuppliers = false;
          this.toast.error('Failed to load suppliers', err?.error?.message || 'Server error');
        },
      });
  }

  openAddSupplier(): void {
    this.isEditingSupplier = false;
    this.supplierForm = {
      id: '',
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      businessId: '',
      notes: '',
    };
    this.supplierErrors = {};
    this.supplierModalOpen = true;
  }

  openEditSupplier(sup: SupplierItem): void {
    this.isEditingSupplier = true;
    this.supplierForm = {
      id: sup.id,
      name: sup.name,
      contactPerson: sup.contact_person || '',
      phone: sup.phone,
      email: sup.email || '',
      address: sup.address || '',
      businessId: sup.business_id || '',
      notes: sup.notes || '',
    };
    this.supplierErrors = {};
    this.supplierModalOpen = true;
  }

  saveSupplier(): void {
    this.supplierErrors = {};

    const name = (this.supplierForm.name || '').trim();
    if (!name || name.length < 2) {
      this.supplierErrors['name'] = 'Please enter a supplier company name (at least 2 characters).';
    }

    const phone = (this.supplierForm.phone || '').trim();
    if (!phone || !isValidPhone(phone)) {
      this.supplierErrors['phone'] = 'Please enter a valid contact phone number.';
    }

    const email = (this.supplierForm.email || '').trim();
    if (email && !isValidEmail(email)) {
      this.supplierErrors['email'] = 'Please enter a valid email address.';
    }

    if (Object.keys(this.supplierErrors).length > 0) {
      this.toast.warning('Please correct the highlighted supplier fields.');
      return;
    }

    if (this.isEditingSupplier && this.supplierForm.id) {
      this.suppliersService.updateSupplier(this.supplierForm.id, this.supplierForm).subscribe({
        next: (sup) => {
          this.toast.success('Supplier Updated', `${sup.name} profile updated.`);
          this.supplierModalOpen = false;
          this.loadSuppliers();
        },
        error: (err) => {
          if (err?.error?.fieldErrors) {
            this.supplierErrors = err.error.fieldErrors;
          }
          this.toast.error('Update Failed', err?.error?.message || err?.message || 'Could not update supplier.');
        },
      });
    } else {
      this.suppliersService.createSupplier(this.supplierForm).subscribe({
        next: (sup) => {
          this.toast.success('Supplier Registered', `${sup.name} registered.`);
          this.supplierModalOpen = false;
          this.loadSuppliers();
        },
        error: (err) => {
          if (err?.error?.fieldErrors) {
            this.supplierErrors = err.error.fieldErrors;
          }
          this.toast.error('Registration Failed', err?.error?.message || err?.message || 'Could not register supplier.');
        },
      });
    }
  }

  toggleSupplierStatus(sup: SupplierItem): void {
    this.suppliersService.toggleStatus(sup.id).subscribe({
      next: (updated) => {
        sup.status = updated.status;
        this.toast.info('Status Changed', `${sup.name} is now ${updated.status}.`);
      },
      error: (err) => {
        this.toast.error('Toggle Failed', err?.error?.message || 'Error');
      },
    });
  }

  // --- 6. Stock Movements & Manual Adjustments ---
  loadMovements(): void {
    this.loadingMovements = true;
    this.inventoryService
      .getMovements({
        itemType: this.selectedMovementItemType === 'All' ? undefined : this.selectedMovementItemType,
        movementType: this.selectedMovementType === 'All' ? undefined : this.selectedMovementType,
        search: this.movementSearch.value || undefined,
      })
      .subscribe({
        next: (data) => {
          this.movements = data;
          this.loadingMovements = false;
        },
        error: (err) => {
          this.loadingMovements = false;
          this.toast.error('Failed to load movements', err?.error?.message || 'Server error');
        },
      });
  }

  openAdjustmentModal(itemType: 'PHONE' | 'ACCESSORY', productId?: string): void {
    this.adjustmentForm = {
      itemType,
      productId: productId || (itemType === 'ACCESSORY' ? (this.accessories[0]?.id || '') : (this.phones[0]?.id || '')),
      newQuantity: 0,
      newStatus: 'IN_STOCK',
      reason: '',
    };
    if (itemType === 'ACCESSORY') {
      const acc = this.accessories.find((a) => a.id === this.adjustmentForm.productId);
      if (acc) this.adjustmentForm.newQuantity = acc.available_quantity ?? acc.quantity ?? 0;
    }
    this.adjustmentErrors = {};
    this.adjustmentModalOpen = true;
  }

  submitAdjustment(): void {
    this.adjustmentErrors = {};

    if (!this.adjustmentForm.productId) {
      this.adjustmentErrors['productId'] = 'Please select a product.';
    }

    if (this.adjustmentForm.itemType === 'ACCESSORY') {
      const qty = Number(this.adjustmentForm.newQuantity);
      if (isNaN(qty) || qty < 0) {
        this.adjustmentErrors['newQuantity'] = 'Stock quantity cannot be negative.';
      }
    }

    const reason = (this.adjustmentForm.reason || '').trim();
    if (!reason || reason.length < 3) {
      this.adjustmentErrors['reason'] = 'Please provide a clear reason for the manual adjustment (at least 3 characters).';
    }

    if (Object.keys(this.adjustmentErrors).length > 0) {
      this.toast.warning('Please correct the highlighted adjustment fields.');
      return;
    }

    this.inventoryService.adjustStock(this.adjustmentForm).subscribe({
      next: () => {
        this.toast.success('Stock Adjustment Logged', 'Inventory records and audit logs updated.');
        this.adjustmentModalOpen = false;
        this.loadMovements();
        this.loadActiveTabData();
      },
      error: (err) => {
        if (err?.error?.fieldErrors) {
          this.adjustmentErrors = err.error.fieldErrors;
        }
        this.toast.error('Adjustment Failed', err?.error?.message || err?.message || 'Could not adjust stock.');
      },
    });
  }

  // --- 7. Physical Stock-Taking Audits ---
  loadStockTakes(): void {
    this.loadingStockTakes = true;
    this.stockTakingService.getSessions().subscribe({
      next: (sessions) => {
        this.stockTakes = sessions;
        this.loadingStockTakes = false;
      },
      error: (err) => {
        this.loadingStockTakes = false;
        this.toast.error('Failed to load stock audits', err?.error?.message || 'Server error');
      },
    });
  }

  openNewStockTakeModal(): void {
    this.stockTakeForm = {
      title: `Physical Audit — ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
      notes: '',
      scope: 'ALL',
    };
    this.stockTakeModalOpen = true;
  }

  startStockTake(): void {
    if (!this.stockTakeForm.title.trim()) {
      this.toast.error('Validation Error', 'Audit session title is required.');
      return;
    }

    this.stockTakingService.createSession(this.stockTakeForm).subscribe({
      next: (created) => {
        this.toast.success('Audit Session Started', `Code: ${created.sessionCode}. Inventory snapshot ready.`);
        this.stockTakeModalOpen = false;
        this.loadStockTakes();
        this.openStockTakeCountModal(created.id);
      },
      error: (err) => {
        this.toast.error('Failed to start session', err?.error?.message || 'Server error');
      },
    });
  }

  openStockTakeCountModal(sessionId: string): void {
    this.stockTakingService.getSession(sessionId).subscribe({
      next: (session) => {
        this.activeStockTake = session;
        this.stockTakeCountModalOpen = true;
      },
      error: (err) => {
        this.toast.error('Failed to load audit items', err?.error?.message || 'Server error');
      },
    });
  }

  onStockCountChanged(item: StockTakeItem): void {
    item.discrepancy = item.counted_quantity - item.expected_quantity;
  }

  saveStockTakeCounts(): void {
    if (!this.activeStockTake) return;
    const items = this.activeStockTake.items.map((it) => ({
      id: it.id,
      countedQuantity: Number(it.counted_quantity),
      discrepancyReason: it.discrepancy_reason || undefined,
      verified: !!it.verified,
    }));

    this.stockTakingService.updateCounts(this.activeStockTake.id, items).subscribe({
      next: () => {
        this.toast.success('Counts Saved', 'Physical counts updated successfully.');
      },
      error: (err) => {
        this.toast.error('Save Failed', err?.error?.message || 'Error');
      },
    });
  }

  finalizeStockTake(): void {
    if (!this.activeStockTake) return;
    const sessionId = this.activeStockTake.id;
    const code = this.activeStockTake.session_code;
    this.openConfirm(
      `Finalize Physical Audit ${code}`,
      `Reconcile store inventory to your physical counts? ${this.stockTakeDiscrepancyCount} discrepancy item(s) will automatically generate stock adjustment audit entries.`,
      'Finalize & Reconcile',
      true,
      () => {
        this.stockTakingService.finalizeSession(sessionId).subscribe({
          next: () => {
            this.toast.success('Audit Finalized', 'Inventory reconciled to physical counts.');
            this.stockTakeCountModalOpen = false;
            this.activeStockTake = null;
            this.loadStockTakes();
            this.loadActiveTabData();
          },
          error: (err) => {
            this.toast.error('Finalization Failed', err?.error?.message || 'Server error');
          },
        });
      }
    );
  }
}
