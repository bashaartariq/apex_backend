import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MockDataService } from '../../core/services/mock-data.service';
import { ToastService } from '../../core/services/toast.service';
import {
  AccessoryCategory,
  AccessoryItem,
  DeviceCondition,
  DeviceStockStatus,
  MobilePhone,
} from '../../core/models/inventory.models';

@Component({
  selector: 'app-inventory',
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss'],
})
export class InventoryComponent implements OnInit {
  activeTab: 'phones' | 'accessories' | 'reorder' = 'phones';

  // Data lists
  phones: MobilePhone[] = [];
  filteredPhones: MobilePhone[] = [];
  accessories: AccessoryItem[] = [];
  filteredAccessories: AccessoryItem[] = [];

  // Filter Form Controls
  phoneSearch = new FormControl('');
  selectedBrand = 'All';
  selectedCondition = 'All';
  selectedStatus = 'All';

  accessorySearch = new FormControl('');
  selectedCategory = 'All';
  onlyLowStock = false;

  // Selected phone for inspection drawer
  selectedPhoneForDrawer: MobilePhone | null = null;
  drawerOpen = false;

  // Modal States
  showAddPhoneModal = false;
  showAddAccessoryModal = false;
  showDeleteConfirm = false;
  deleteTarget: { type: 'phone' | 'accessory'; id: string; name: string } | null = null;

  // Form Models for Adding Phone
  newPhone: Partial<MobilePhone> = {
    brand: 'Apple',
    model: '',
    imei1: '',
    imei2: '',
    ram: '8GB',
    storage: '256GB',
    color: 'Black',
    condition: 'Brand New',
    batteryHealth: 100,
    purchasePrice: 0,
    sellingPrice: 0,
    supplier: 'Apex Global Distribution',
    notes: '',
  };

  // Form Models for Adding Accessory
  newAccessory: Partial<AccessoryItem> = {
    name: '',
    sku: '',
    barcode: '',
    category: 'Chargers & Adapters',
    brand: 'Anker',
    purchasePrice: 0,
    sellingPrice: 0,
    quantity: 10,
    minThreshold: 5,
  };

  constructor(
    private readonly mockData: MockDataService,
    public readonly toast: ToastService
  ) {}

  issuePO(supplier: string, units: number, poNum: string): void {
    this.toast.success('Purchase Order Dispatched', `${poNum} issued to ${supplier} for ${units} units.`);
  }

  ngOnInit(): void {
    this.mockData.phones$.subscribe((phones) => {
      this.phones = phones;
      this.applyPhoneFilters();
    });

    this.mockData.accessories$.subscribe((acc) => {
      this.accessories = acc;
      this.applyAccessoryFilters();
    });

    this.phoneSearch.valueChanges.subscribe(() => this.applyPhoneFilters());
    this.accessorySearch.valueChanges.subscribe(() => this.applyAccessoryFilters());
  }

  setTab(tab: 'phones' | 'accessories' | 'reorder'): void {
    this.activeTab = tab;
  }

  applyPhoneFilters(): void {
    const term = (this.phoneSearch.value || '').trim().toLowerCase();
    this.filteredPhones = this.phones.filter((p) => {
      const matchSearch =
        !term ||
        p.model.toLowerCase().includes(term) ||
        p.brand.toLowerCase().includes(term) ||
        p.imei1.includes(term) ||
        (p.imei2 && p.imei2.includes(term));

      const matchBrand = this.selectedBrand === 'All' || p.brand === this.selectedBrand;
      const matchCondition = this.selectedCondition === 'All' || p.condition === this.selectedCondition;
      const matchStatus = this.selectedStatus === 'All' || p.status === this.selectedStatus;

      return matchSearch && matchBrand && matchCondition && matchStatus;
    });
  }

  applyAccessoryFilters(): void {
    const term = (this.accessorySearch.value || '').trim().toLowerCase();
    this.filteredAccessories = this.accessories.filter((a) => {
      const matchSearch =
        !term ||
        a.name.toLowerCase().includes(term) ||
        a.sku.toLowerCase().includes(term) ||
        a.barcode.includes(term) ||
        a.brand.toLowerCase().includes(term);

      const matchCat = this.selectedCategory === 'All' || a.category === this.selectedCategory;
      const matchLow = !this.onlyLowStock || a.quantity <= a.minThreshold;

      return matchSearch && matchCat && matchLow;
    });
  }

  openPhoneDrawer(phone: MobilePhone): void {
    this.selectedPhoneForDrawer = phone;
    this.drawerOpen = true;
  }

  closePhoneDrawer(): void {
    this.drawerOpen = false;
    this.selectedPhoneForDrawer = null;
  }

  openAddPhone(): void {
    this.newPhone = {
      brand: 'Apple',
      model: '',
      imei1: '',
      imei2: '',
      ram: '8GB',
      storage: '256GB',
      color: 'Titanium',
      condition: 'Brand New',
      batteryHealth: 100,
      purchasePrice: 800,
      sellingPrice: 999,
      supplier: 'Apex Global Distribution',
      notes: '',
    };
    this.showAddPhoneModal = true;
  }

  savePhone(): void {
    if (!this.newPhone.model || !this.newPhone.imei1) {
      this.toast.error('Validation Error', 'Model and Primary IMEI are mandatory.');
      return;
    }

    const created: MobilePhone = {
      id: `PH-${Math.floor(108 + Math.random() * 900)}`,
      brand: this.newPhone.brand || 'Apple',
      model: this.newPhone.model,
      imei1: this.newPhone.imei1,
      imei2: this.newPhone.imei2 || undefined,
      ram: this.newPhone.ram || '8GB',
      storage: this.newPhone.storage || '256GB',
      color: this.newPhone.color || 'Black',
      condition: (this.newPhone.condition as DeviceCondition) || 'Brand New',
      batteryHealth: Number(this.newPhone.batteryHealth) || 100,
      purchasePrice: Number(this.newPhone.purchasePrice) || 0,
      sellingPrice: Number(this.newPhone.sellingPrice) || 0,
      status: 'In Stock',
      supplier: this.newPhone.supplier || 'Apex Global Distribution',
      inStockDate: new Date().toISOString().split('T')[0],
      notes: this.newPhone.notes,
    };

    this.mockData.addPhone(created);
    this.showAddPhoneModal = false;
    this.toast.success('Device Registered', `${created.brand} ${created.model} (${created.imei1}) recorded in inventory.`);
  }

  openAddAccessory(): void {
    this.newAccessory = {
      name: '',
      sku: '',
      barcode: '',
      category: 'Chargers & Adapters',
      brand: 'Anker',
      purchasePrice: 15,
      sellingPrice: 29.99,
      quantity: 20,
      minThreshold: 5,
    };
    this.showAddAccessoryModal = true;
  }

  saveAccessory(): void {
    if (!this.newAccessory.name || !this.newAccessory.sku) {
      this.toast.error('Validation Error', 'Accessory name and SKU are mandatory.');
      return;
    }

    const created: AccessoryItem = {
      id: `ACC-${Math.floor(208 + Math.random() * 900)}`,
      name: this.newAccessory.name,
      sku: this.newAccessory.sku.toUpperCase(),
      barcode: this.newAccessory.barcode || String(Math.floor(100000000000 + Math.random() * 900000000000)),
      category: (this.newAccessory.category as AccessoryCategory) || 'Chargers & Adapters',
      brand: this.newAccessory.brand || 'Generic',
      purchasePrice: Number(this.newAccessory.purchasePrice) || 0,
      sellingPrice: Number(this.newAccessory.sellingPrice) || 0,
      quantity: Number(this.newAccessory.quantity) || 1,
      minThreshold: Number(this.newAccessory.minThreshold) || 5,
    };

    this.mockData.addAccessory(created);
    this.showAddAccessoryModal = false;
    this.toast.success('Accessory Stock Added', `${created.name} (${created.quantity} units) added.`);
  }

  confirmDeletePhone(p: MobilePhone): void {
    this.deleteTarget = { type: 'phone', id: p.id, name: `${p.brand} ${p.model} (${p.imei1})` };
    this.showDeleteConfirm = true;
  }

  confirmDeleteAccessory(a: AccessoryItem): void {
    this.deleteTarget = { type: 'accessory', id: a.id, name: `${a.name} (${a.sku})` };
    this.showDeleteConfirm = true;
  }

  executeDelete(): void {
    if (!this.deleteTarget) return;
    if (this.deleteTarget.type === 'phone') {
      this.mockData.deletePhone(this.deleteTarget.id);
      this.toast.warning('Device De-registered', `${this.deleteTarget.name} removed from inventory.`);
    } else {
      this.mockData.deleteAccessory(this.deleteTarget.id);
      this.toast.warning('Stock Deleted', `${this.deleteTarget.name} removed from catalog.`);
    }
    this.showDeleteConfirm = false;
    this.deleteTarget = null;
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteTarget = null;
  }

  adjustAccessoryStock(item: AccessoryItem, delta: number): void {
    item.quantity = Math.max(0, item.quantity + delta);
    this.toast.info('Stock Level Updated', `${item.name} quantity adjusted to ${item.quantity}.`);
  }
}
