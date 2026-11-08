import { Component, OnInit } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MockDataService } from '../../core/services/mock-data.service';
import { ToastService } from '../../core/services/toast.service';
import {
  AccessoryItem,
  CartItem,
  Customer,
  MobilePhone,
  PosSaleTransaction,
} from '../../core/models/inventory.models';

export interface PosCatalogItem {
  id: string;
  name: string;
  identifier: string; // IMEI or SKU
  category: string;
  brand: string;
  price: number;
  stock: number;
  type: 'phone' | 'accessory';
  condition?: string;
  specs?: string;
}

@Component({
  selector: 'app-pos',
  templateUrl: './pos.component.html',
  styleUrls: ['./pos.component.scss'],
})
export class PosComponent implements OnInit {
  cart: CartItem[] = [];
  catalogItems: PosCatalogItem[] = [];
  filteredCatalog: PosCatalogItem[] = [];
  customers: Customer[] = [];

  selectedCategory = 'All';
  readonly categories = ['All', 'Phones (IMEI)', 'Chargers', 'Cases', 'Screen Protectors', 'Audio'];

  barcodeInput = new FormControl('');
  selectedCustomer: Customer | null = null;
  discountAmount = 0;
  taxRate = 0.05; // 5% Sales Tax / VAT

  // Payment Modal State
  showPaymentModal = false;
  paymentMethod: 'Cash' | 'Credit/Debit Card' | 'Bank Transfer' | 'Split Payment' = 'Credit/Debit Card';
  cashTendered = 0;

  // Receipt Modal State
  showReceiptModal = false;
  completedSale: PosSaleTransaction | null = null;

  // New Customer Modal
  showNewCustomerModal = false;
  newCustomerName = '';
  newCustomerPhone = '';

  constructor(
    private readonly mockData: MockDataService,
    private readonly toast: ToastService
  ) {}

  ngOnInit(): void {
    this.buildCatalog();
    this.customers = this.mockData.customers;

    // Load initial fast items into cart for realistic presentation
    this.cart = [
      {
        id: 'PH-101',
        title: 'iPhone 15 Pro Max 256GB Natural Titanium',
        identifier: 'IMEI: 354892019482711',
        type: 'phone',
        unitPrice: 1199.0,
        quantity: 1,
        subtotal: 1199.0,
        taxRate: 0.05,
        maxStock: 6,
      },
      {
        id: 'ACC-201',
        title: 'Apple 20W USB-C Power Adapter',
        identifier: 'SKU: APL-PWR-20W',
        type: 'accessory',
        unitPrice: 19.0,
        quantity: 2,
        subtotal: 38.0,
        taxRate: 0.05,
        maxStock: 42,
      },
    ];

    this.barcodeInput.valueChanges.subscribe((term) => {
      this.filterCatalog(term || '');
    });
  }

  buildCatalog(): void {
    const phones: PosCatalogItem[] = this.mockData.phones
      .filter((p) => p.status === 'In Stock')
      .map((p) => ({
        id: p.id,
        name: `${p.brand} ${p.model} (${p.storage})`,
        identifier: p.imei1,
        category: 'Phones (IMEI)',
        brand: p.brand,
        price: p.sellingPrice,
        stock: 1,
        type: 'phone',
        condition: p.condition,
        specs: `${p.color} &middot; Battery: ${p.batteryHealth || 100}%`,
      }));

    const accessories: PosCatalogItem[] = this.mockData.accessories.map((a) => ({
      id: a.id,
      name: a.name,
      identifier: a.sku,
      category: a.category.includes('Charger')
        ? 'Chargers'
        : a.category.includes('Case')
        ? 'Cases'
        : a.category.includes('Screen')
        ? 'Screen Protectors'
        : 'Audio',
      brand: a.brand,
      price: a.sellingPrice,
      stock: a.quantity,
      type: 'accessory',
    }));

    this.catalogItems = [...phones, ...accessories];
    this.filteredCatalog = [...this.catalogItems];
  }

  setCategory(cat: string): void {
    this.selectedCategory = cat;
    this.filterCatalog(this.barcodeInput.value || '');
  }

  filterCatalog(term: string): void {
    const cleanTerm = term.trim().toLowerCase();
    this.filteredCatalog = this.catalogItems.filter((item) => {
      const matchCat = this.selectedCategory === 'All' || item.category === this.selectedCategory;
      const matchText =
        !cleanTerm ||
        item.name.toLowerCase().includes(cleanTerm) ||
        item.identifier.toLowerCase().includes(cleanTerm) ||
        item.brand.toLowerCase().includes(cleanTerm);
      return matchCat && matchText;
    });
  }

  addToCart(item: PosCatalogItem): void {
    const existingIndex = this.cart.findIndex((c) => c.id === item.id);
    if (existingIndex > -1) {
      if (item.type === 'phone') {
        this.toast.warning('Serialized Phone', 'Single IMEI device cannot be incremented. Select a second device with a distinct IMEI.');
        return;
      }
      this.cart[existingIndex].quantity += 1;
      this.cart[existingIndex].subtotal = this.cart[existingIndex].quantity * this.cart[existingIndex].unitPrice;
    } else {
      this.cart.push({
        id: item.id,
        title: item.name,
        identifier: item.type === 'phone' ? `IMEI: ${item.identifier}` : `SKU: ${item.identifier}`,
        type: item.type,
        unitPrice: item.price,
        quantity: 1,
        subtotal: item.price,
        taxRate: this.taxRate,
        maxStock: item.stock,
      });
    }

    this.toast.info('Item Added', `${item.name} added to current sale.`);
  }

  updateQuantity(index: number, delta: number): void {
    const item = this.cart[index];
    if (item.type === 'phone' && delta > 0) {
      this.toast.warning('Serialized Device', 'Phones are serialized by unique IMEI.');
      return;
    }
    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      this.cart.splice(index, 1);
    } else {
      item.quantity = newQty;
      item.subtotal = item.quantity * item.unitPrice;
    }
  }

  removeFromCart(index: number): void {
    this.cart.splice(index, 1);
  }

  clearCart(): void {
    this.cart = [];
    this.discountAmount = 0;
    this.toast.info('Cart Reset', 'Sale register emptied.');
  }

  suspendSale(): void {
    if (this.cart.length === 0) return;
    this.toast.warning('Sale Suspended', `Order with ${this.cart.length} item(s) held for customer return.`);
    this.clearCart();
  }

  applyDiscount(amount: number): void {
    this.discountAmount = amount;
    this.toast.success('Discount Applied', `$${amount.toFixed(2)} applied to invoice.`);
  }

  get subtotal(): number {
    return this.cart.reduce((acc, it) => acc + it.subtotal, 0);
  }

  get taxAmount(): number {
    return Math.max(0, this.subtotal - this.discountAmount) * this.taxRate;
  }

  get totalPayable(): number {
    return Math.max(0, this.subtotal - this.discountAmount + this.taxAmount);
  }

  get changeDue(): number {
    return Math.max(0, this.cashTendered - this.totalPayable);
  }

  openPayment(): void {
    if (this.cart.length === 0) {
      this.toast.warning('Cart Empty', 'Add products before proceeding to payment.');
      return;
    }
    this.cashTendered = Math.ceil(this.totalPayable);
    this.showPaymentModal = true;
  }

  setExactCash(): void {
    this.cashTendered = this.totalPayable;
  }

  addCash(amount: number): void {
    this.cashTendered += amount;
  }

  completeSale(): void {
    const invoiceNum = `INV-2026-0${Math.floor(842 + Math.random() * 100)}`;
    const sale: PosSaleTransaction = {
      id: `TXN-${Date.now()}`,
      invoiceNumber: invoiceNum,
      timestamp: 'Just now',
      customerName: this.selectedCustomer ? this.selectedCustomer.name : 'Walk-in Customer',
      customerPhone: this.selectedCustomer?.phone,
      items: this.cart.map((c) => ({
        name: c.title,
        quantity: c.quantity,
        price: c.unitPrice,
        imei: c.type === 'phone' ? c.identifier.replace('IMEI: ', '') : undefined,
      })),
      subtotal: this.subtotal,
      discount: this.discountAmount,
      tax: this.taxAmount,
      total: this.totalPayable,
      paymentMethod: this.paymentMethod,
      status: 'Completed',
      cashierName: 'Alex Mercer',
    };

    this.mockData.recordSale(sale);
    this.completedSale = sale;
    this.showPaymentModal = false;
    this.showReceiptModal = true;
    this.cart = [];
    this.discountAmount = 0;
    this.toast.success('Transaction Completed', `Invoice ${invoiceNum} tendered successfully via ${this.paymentMethod}.`);
  }

  printReceipt(): void {
    window.print();
    this.toast.info('Thermal Receipt', 'Printed customer receipt slip.');
  }

  closeReceipt(): void {
    this.showReceiptModal = false;
    this.completedSale = null;
  }

  selectCustomer(customer: Customer | null): void {
    this.selectedCustomer = customer;
    if (customer) {
      this.toast.info('Customer Attached', `${customer.name} (${customer.loyaltyTier}) linked to transaction.`);
    }
  }

  saveNewCustomer(): void {
    if (!this.newCustomerName) return;
    const created: Customer = {
      id: `CUST-${100 + this.customers.length + 1}`,
      name: this.newCustomerName,
      phone: this.newCustomerPhone || 'N/A',
      email: `${this.newCustomerName.toLowerCase().replace(/\s+/g, '')}@gmail.com`,
      loyaltyTier: 'Standard',
      totalSpent: 0,
      totalVisits: 1,
      lastVisit: 'Today',
      registeredImeis: [],
    };
    this.customers.push(created);
    this.selectedCustomer = created;
    this.showNewCustomerModal = false;
    this.newCustomerName = '';
    this.newCustomerPhone = '';
    this.toast.success('Customer Registered', `${created.name} added to retail CRM.`);
  }
}
