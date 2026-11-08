import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  AccessoryItem,
  Customer,
  MobilePhone,
  PosSaleTransaction,
} from '../models/inventory.models';

@Injectable({
  providedIn: 'root',
})
export class MockDataService {
  private readonly phonesSubject = new BehaviorSubject<MobilePhone[]>([
    {
      id: 'PH-101',
      brand: 'Apple',
      model: 'iPhone 15 Pro Max',
      imei1: '354892019482711',
      imei2: '354892019482712',
      ram: '8GB',
      storage: '256GB',
      color: 'Natural Titanium',
      condition: 'Brand New',
      batteryHealth: 100,
      purchasePrice: 980.0,
      sellingPrice: 1199.0,
      status: 'In Stock',
      supplier: 'Apex Global Distribution',
      inStockDate: '2026-11-01',
      notes: 'Factory sealed, North American spec A2849',
    },
    {
      id: 'PH-102',
      brand: 'Apple',
      model: 'iPhone 14 Pro',
      imei1: '359102948271049',
      imei2: '359102948271050',
      ram: '6GB',
      storage: '128GB',
      color: 'Space Black',
      condition: 'Pre-Owned Grade A',
      batteryHealth: 92,
      purchasePrice: 620.0,
      sellingPrice: 799.0,
      status: 'In Stock',
      supplier: 'Verified Trade-In Hub',
      inStockDate: '2026-11-03',
      notes: 'Pristine condition, original display, zero micro-scratches',
    },
    {
      id: 'PH-103',
      brand: 'Samsung',
      model: 'Galaxy S24 Ultra',
      imei1: '351982736450192',
      imei2: '351982736450193',
      ram: '12GB',
      storage: '512GB',
      color: 'Titanium Gray',
      condition: 'Brand New',
      batteryHealth: 100,
      purchasePrice: 1040.0,
      sellingPrice: 1299.0,
      status: 'In Stock',
      supplier: 'Samsung Direct Logistics',
      inStockDate: '2026-11-02',
      notes: 'Includes S-Pen, official 24-month regional warranty',
    },
    {
      id: 'PH-104',
      brand: 'Samsung',
      model: 'Galaxy Z Flip5',
      imei1: '357281904726194',
      ram: '8GB',
      storage: '256GB',
      color: 'Mint',
      condition: 'Pre-Owned Grade A',
      batteryHealth: 96,
      purchasePrice: 510.0,
      sellingPrice: 679.0,
      status: 'In Stock',
      supplier: 'Verified Trade-In Hub',
      inStockDate: '2026-11-04',
      notes: 'Hinge mechanism fully tested, screen protector intact',
    },
    {
      id: 'PH-105',
      brand: 'Google',
      model: 'Pixel 8 Pro',
      imei1: '353918274619283',
      ram: '12GB',
      storage: '128GB',
      color: 'Bay Blue',
      condition: 'Brand New',
      batteryHealth: 100,
      purchasePrice: 670.0,
      sellingPrice: 849.0,
      status: 'In Stock',
      supplier: 'Apex Global Distribution',
      inStockDate: '2026-11-05',
      notes: 'Unlocked for all GSM carriers',
    },
    {
      id: 'PH-106',
      brand: 'Apple',
      model: 'iPhone 13',
      imei1: '358201948271629',
      ram: '4GB',
      storage: '128GB',
      color: 'Midnight',
      condition: 'Pre-Owned Grade B',
      batteryHealth: 86,
      purchasePrice: 340.0,
      sellingPrice: 469.0,
      status: 'In Stock',
      supplier: 'Wholesale Auctions Ltd',
      inStockDate: '2026-10-28',
      notes: 'Minor bezel scuffing, 100% functional, 90-day store warranty',
    },
    {
      id: 'PH-107',
      brand: 'Xiaomi',
      model: '14 Ultra',
      imei1: '864920192847192',
      ram: '16GB',
      storage: '512GB',
      color: 'White',
      condition: 'Brand New',
      batteryHealth: 100,
      purchasePrice: 820.0,
      sellingPrice: 1049.0,
      status: 'Reserved',
      supplier: 'Apex Global Distribution',
      inStockDate: '2026-11-06',
      notes: 'Reserved for customer #CUST-104 (Deposit paid)',
    },
  ]);

  private readonly accessoriesSubject = new BehaviorSubject<AccessoryItem[]>([
    {
      id: 'ACC-201',
      name: 'Apple 20W USB-C Power Adapter',
      sku: 'APL-PWR-20W',
      barcode: '194252157007',
      category: 'Chargers & Adapters',
      brand: 'Apple',
      purchasePrice: 11.5,
      sellingPrice: 19.0,
      quantity: 42,
      minThreshold: 15,
      compatibility: 'Universal USB-C / PD 3.0',
    },
    {
      id: 'ACC-202',
      name: 'Anker 735 GaN 65W Fast Charger (3-Port)',
      sku: 'ANK-65W-GAN',
      barcode: '194644084615',
      category: 'Chargers & Adapters',
      brand: 'Anker',
      purchasePrice: 24.0,
      sellingPrice: 39.99,
      quantity: 18,
      minThreshold: 10,
      compatibility: 'Laptops, Tablets, iPhones & Androids',
    },
    {
      id: 'ACC-203',
      name: 'iPhone 15 Pro MagSafe Silicone Case - Midnight',
      sku: 'CASE-IP15P-MID',
      barcode: '195949012948',
      category: 'Cases & Protection',
      brand: 'Apple',
      purchasePrice: 28.0,
      sellingPrice: 49.0,
      quantity: 8,
      minThreshold: 10, // Low stock indicator
      compatibility: 'iPhone 15 Pro',
    },
    {
      id: 'ACC-204',
      name: 'Torras 9H Tempered Glass for iPhone 15 Pro (2-Pack)',
      sku: 'GLS-IP15P-2PK',
      barcode: '840192837461',
      category: 'Screen Protectors',
      brand: 'Torras',
      purchasePrice: 6.0,
      sellingPrice: 16.99,
      quantity: 64,
      minThreshold: 20,
      compatibility: 'iPhone 15 Pro (Auto-alignment frame included)',
    },
    {
      id: 'ACC-205',
      name: 'Samsung 45W Type-C Super Fast Wall Charger',
      sku: 'SAM-PWR-45W',
      barcode: '887276602912',
      category: 'Chargers & Adapters',
      brand: 'Samsung',
      purchasePrice: 16.0,
      sellingPrice: 29.0,
      quantity: 5,
      minThreshold: 12, // Low stock trigger
      compatibility: 'Galaxy S24 / S23 / Tab S9',
    },
    {
      id: 'ACC-206',
      name: 'Apple AirPods Pro (2nd Gen) USB-C MagSafe',
      sku: 'APL-APP2-USBC',
      barcode: '195949052517',
      category: 'Audio & Wearables',
      brand: 'Apple',
      purchasePrice: 185.0,
      sellingPrice: 249.0,
      quantity: 12,
      minThreshold: 6,
      compatibility: 'iOS / macOS / Bluetooth',
    },
    {
      id: 'ACC-207',
      name: 'Baseus 20,000mAh 65W Power Bank with Digital Display',
      sku: 'BAS-PB-20K-65W',
      barcode: '693217260481',
      category: 'Power Banks',
      brand: 'Baseus',
      purchasePrice: 32.0,
      sellingPrice: 54.99,
      quantity: 4,
      minThreshold: 8, // Low stock
      compatibility: 'Universal high-power fast charging',
    },
  ]);

  private readonly salesSubject = new BehaviorSubject<PosSaleTransaction[]>([
    {
      id: 'TXN-9041',
      invoiceNumber: 'INV-2026-0841',
      timestamp: 'Today, 10:42 AM',
      customerName: 'Marcus Vance',
      customerPhone: '+1 (555) 234-8901',
      items: [
        { name: 'iPhone 15 Pro Max 256GB', quantity: 1, price: 1199.0, imei: '354892019482711' },
        { name: 'Apple 20W USB-C Adapter', quantity: 1, price: 19.0 },
      ],
      subtotal: 1218.0,
      discount: 25.0,
      tax: 59.65,
      total: 1252.65,
      paymentMethod: 'Credit/Debit Card',
      status: 'Completed',
      cashierName: 'Alex Mercer',
    },
    {
      id: 'TXN-9040',
      invoiceNumber: 'INV-2026-0840',
      timestamp: 'Today, 09:18 AM',
      customerName: 'Walk-in Customer',
      items: [
        { name: 'Torras 9H Tempered Glass (2-Pack)', quantity: 2, price: 16.99 },
        { name: 'Anker 735 GaN 65W Charger', quantity: 1, price: 39.99 },
      ],
      subtotal: 73.97,
      discount: 0,
      tax: 3.7,
      total: 77.67,
      paymentMethod: 'Cash',
      status: 'Completed',
      cashierName: 'Sarah Jenkins',
    },
    {
      id: 'TXN-9039',
      invoiceNumber: 'INV-2026-0839',
      timestamp: 'Yesterday, 05:54 PM',
      customerName: 'Elena Rostova',
      customerPhone: '+1 (555) 891-3412',
      items: [
        { name: 'Samsung Galaxy S24 Ultra 512GB', quantity: 1, price: 1299.0, imei: '351982736450192' },
        { name: 'Samsung 45W Fast Charger', quantity: 1, price: 29.0 },
      ],
      subtotal: 1328.0,
      discount: 50.0,
      tax: 63.9,
      total: 1341.9,
      paymentMethod: 'Bank Transfer',
      status: 'Completed',
      cashierName: 'Alex Mercer',
    },
    {
      id: 'TXN-9038',
      invoiceNumber: 'INV-2026-0838',
      timestamp: 'Yesterday, 02:11 PM',
      customerName: 'David Chen',
      items: [
        { name: 'Apple AirPods Pro (2nd Gen)', quantity: 1, price: 249.0 },
      ],
      subtotal: 249.0,
      discount: 10.0,
      tax: 11.95,
      total: 250.95,
      paymentMethod: 'Credit/Debit Card',
      status: 'Completed',
      cashierName: 'Sarah Jenkins',
    },
  ]);

  private readonly customersSubject = new BehaviorSubject<Customer[]>([
    {
      id: 'CUST-101',
      name: 'Marcus Vance',
      phone: '+1 (555) 234-8901',
      email: 'm.vance@vancetech.io',
      loyaltyTier: 'Gold VIP',
      totalSpent: 4890.5,
      totalVisits: 14,
      lastVisit: 'Today',
      registeredImeis: ['354892019482711', '359102948271049'],
    },
    {
      id: 'CUST-102',
      name: 'Elena Rostova',
      phone: '+1 (555) 891-3412',
      email: 'elena.rostova@designworks.com',
      loyaltyTier: 'Silver',
      totalSpent: 2180.0,
      totalVisits: 6,
      lastVisit: 'Yesterday',
      registeredImeis: ['351982736450192'],
    },
    {
      id: 'CUST-103',
      name: 'David Chen',
      phone: '+1 (555) 412-9081',
      email: 'dchen99@gmail.com',
      loyaltyTier: 'Standard',
      totalSpent: 640.0,
      totalVisits: 3,
      lastVisit: 'Yesterday',
      registeredImeis: [],
    },
    {
      id: 'CUST-104',
      name: 'Samantha Green',
      phone: '+1 (555) 672-8819',
      email: 'sgreen@greengroup.org',
      loyaltyTier: 'Gold VIP',
      totalSpent: 6240.0,
      totalVisits: 19,
      lastVisit: '3 days ago',
      registeredImeis: ['864920192847192'],
    },
  ]);

  readonly phones$: Observable<MobilePhone[]> = this.phonesSubject.asObservable();
  readonly accessories$: Observable<AccessoryItem[]> = this.accessoriesSubject.asObservable();
  readonly sales$: Observable<PosSaleTransaction[]> = this.salesSubject.asObservable();
  readonly customers$: Observable<Customer[]> = this.customersSubject.asObservable();

  get phones(): MobilePhone[] {
    return this.phonesSubject.value;
  }

  get accessories(): AccessoryItem[] {
    return this.accessoriesSubject.value;
  }

  get sales(): PosSaleTransaction[] {
    return this.salesSubject.value;
  }

  get customers(): Customer[] {
    return this.customersSubject.value;
  }

  addPhone(phone: MobilePhone): void {
    const current = this.phonesSubject.value;
    this.phonesSubject.next([phone, ...current]);
  }

  addAccessory(item: AccessoryItem): void {
    const current = this.accessoriesSubject.value;
    this.accessoriesSubject.next([item, ...current]);
  }

  recordSale(sale: PosSaleTransaction): void {
    const current = this.salesSubject.value;
    this.salesSubject.next([sale, ...current]);
  }

  deletePhone(id: string): void {
    this.phonesSubject.next(this.phonesSubject.value.filter((p) => p.id !== id));
  }

  deleteAccessory(id: string): void {
    this.accessoriesSubject.next(this.accessoriesSubject.value.filter((a) => a.id !== id));
  }
}
