export type PhoneCondition = 'NEW' | 'USED';
export type DeviceCondition = PhoneCondition | 'Brand New' | 'Pre-Owned Grade A' | 'Pre-Owned Grade B' | 'Refurbished';
export type PhoneStockStatus = 'IN_STOCK' | 'SOLD' | 'RETURNED' | 'RESERVED' | 'UNDER_REPAIR';
export type DeviceStockStatus = PhoneStockStatus | 'In Stock' | 'Reserved' | 'Sold' | 'In Repair';
export type ItemStatus = 'ACTIVE' | 'INACTIVE';
export type PurchaseStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';
export type StockTakeStatus = 'IN_PROGRESS' | 'FINALIZED' | 'CANCELLED';

export interface PhoneItem {
  id: string;
  shop_id?: string;
  brand: string;
  model: string;
  imei1: string;
  imei2?: string | null;
  ram?: string | null;
  storage?: string | null;
  color?: string | null;
  condition: any;
  purchase_cost?: number;
  selling_price?: number;
  supplier_id?: string | null;
  supplier_name?: string | null;
  purchase_date?: string | null;
  battery_health?: number | null;
  batteryHealth?: number;
  physical_condition?: string | null;
  accessories_included?: string | null;
  status: any;
  description?: string | null;
  created_at?: string;
  updated_at?: string;

  // Compatibility aliases
  purchasePrice?: number;
  sellingPrice?: number;
  supplier?: string;
  inStockDate?: string;
  notes?: string;
}

// Alias for older components
export type MobilePhone = PhoneItem;

export interface AccessoryCategory {
  id: string;
  shop_id?: string;
  name: string;
  code?: string;
  item_count?: number;
}

export interface AccessoryBatch {
  id: string;
  shop_id: string;
  accessory_id: string;
  purchase_id?: string | null;
  batch_no?: string | null;
  unit_cost: number;
  initial_quantity: number;
  remaining_quantity: number;
  purchase_date: string;
  created_at: string;
}

export interface AccessoryItem {
  id: string;
  shop_id?: string;
  category_id?: string;
  category_name?: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  name: string;
  brand: string;
  model?: string | null;
  sku: string;
  barcode?: string | null;
  purchase_cost?: number;
  selling_price?: number;
  available_quantity?: number;
  min_stock_threshold?: number;
  description?: string | null;
  status?: ItemStatus;
  is_low_stock?: boolean;
  fifo_valuation?: number;
  created_at?: string;
  updated_at?: string;

  // Backward-compatibility properties
  category?: string;
  purchasePrice?: number;
  sellingPrice?: number;
  quantity?: number;
  minThreshold?: number;
  compatibility?: string;
}

export interface SupplierItem {
  id: string;
  shop_id: string;
  name: string;
  contact_person?: string | null;
  phone: string;
  email?: string | null;
  address?: string | null;
  business_id?: string | null;
  notes?: string | null;
  status: ItemStatus;
  purchase_count?: number;
  total_purchases_amount?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PurchaseLineItem {
  id?: string;
  purchase_id?: string;
  item_type: 'PHONE' | 'ACCESSORY';
  phone_id?: string | null;
  accessory_id?: string | null;
  product_name: string;
  identifier?: string | null;
  quantity: number;
  unitCost: number;
  total_cost: number;
  notes?: string | null;
  brand?: string;
  model?: string;
  imei1?: string;
  imei2?: string | null;
  ram?: string | null;
  storage?: string | null;
  color?: string | null;
  condition?: PhoneCondition;
  sellingPrice?: number;
  sku?: string;
  category_id?: string;
}

export interface PurchaseRecord {
  id: string;
  shop_id: string;
  supplier_id: string;
  supplier_name?: string;
  supplier_phone?: string;
  supplier_email?: string;
  reference_no: string;
  purchase_date: string;
  status: PurchaseStatus;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  notes?: string | null;
  created_by: string;
  created_by_name?: string;
  confirmed_by?: string | null;
  confirmed_by_name?: string | null;
  confirmed_at?: string | null;
  item_count?: number;
  total_units?: number;
  created_at: string;
  items?: PurchaseLineItem[];
}

export interface StockSummary {
  phones: {
    totalInStock: number;
    newCount: number;
    usedCount: number;
    valuation: number;
  };
  accessories: {
    totalQuantity: number;
    totalProducts: number;
    lowStockCount: number;
    valuation: number;
  };
  totalInventoryValuation: number;
  activeAlerts: Array<{
    id: string;
    threshold: number;
    current_quantity: number;
    accessory_name: string;
    accessory_sku: string;
    brand: string;
    category_name: string;
  }>;
  recentPhones: PhoneItem[];
  recentAccessories: AccessoryItem[];
  recentPurchases: PurchaseRecord[];
}

export interface StockMovement {
  id: string;
  shop_id: string;
  item_type: 'PHONE' | 'ACCESSORY';
  product_id: string;
  product_name: string;
  identifier?: string | null;
  movement_type: 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'STOCK_TAKE' | 'RETURN';
  reference_id?: string | null;
  quantity_delta: number;
  unit_cost: number;
  reason?: string | null;
  performed_by: string;
  performed_by_name?: string;
  created_at: string;
}

export interface StockTakeSession {
  id: string;
  shop_id: string;
  session_code: string;
  title: string;
  status: StockTakeStatus;
  started_by: string;
  started_by_name?: string;
  finalized_by?: string | null;
  finalized_by_name?: string | null;
  started_at: string;
  finalized_at?: string | null;
  notes?: string | null;
  total_items?: number;
  discrepancy_count?: number;
}

export interface StockTakeItem {
  id: string;
  stock_take_id: string;
  shop_id: string;
  item_type: 'PHONE' | 'ACCESSORY';
  product_id: string;
  product_name: string;
  identifier?: string | null;
  expected_quantity: number;
  counted_quantity: number;
  discrepancy: number;
  discrepancy_reason?: string | null;
  verified: number;
  created_at: string;
  updated_at: string;
}

// POS and cart models
export interface CartItem {
  id: string;
  title: string;
  identifier: string;
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
