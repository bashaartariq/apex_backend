export type DeviceCondition = 'Brand New' | 'Pre-Owned Grade A' | 'Pre-Owned Grade B' | 'Refurbished';
export type DeviceStockStatus = 'In Stock' | 'Reserved' | 'Sold' | 'In Repair';
export type AccessoryCategory = 'Chargers & Adapters' | 'Cables' | 'Cases & Protection' | 'Screen Protectors' | 'Audio & Wearables' | 'Power Banks';

export interface MobilePhone {
  id: string;
  brand: string;
  model: string;
  imei1: string;
  imei2?: string;
  ram: string;
  storage: string;
  color: string;
  condition: DeviceCondition;
  batteryHealth?: number; // e.g. 100 for new, 89 for used
  purchasePrice: number;
  sellingPrice: number;
  status: DeviceStockStatus;
  supplier: string;
  inStockDate: string;
  notes?: string;
}

export interface AccessoryItem {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  category: AccessoryCategory;
  brand: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  minThreshold: number;
  compatibility?: string;
}

export interface CartItem {
  id: string;
  title: string;
  identifier: string; // IMEI or SKU
  type: 'phone' | 'accessory';
  unitPrice: number;
  quantity: number;
  subtotal: number;
  taxRate: number;
  maxStock: number;
}

export interface PosSaleTransaction {
  id: string;
  invoiceNumber: string;
  timestamp: string;
  customerName: string;
  customerPhone?: string;
  items: Array<{ name: string; quantity: number; price: number; imei?: string }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: 'Cash' | 'Credit/Debit Card' | 'Bank Transfer' | 'Split Payment';
  status: 'Completed' | 'Refunded' | 'Suspended';
  cashierName: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  loyaltyTier: 'Gold VIP' | 'Silver' | 'Standard';
  totalSpent: number;
  totalVisits: number;
  lastVisit: string;
  registeredImeis: string[];
}
