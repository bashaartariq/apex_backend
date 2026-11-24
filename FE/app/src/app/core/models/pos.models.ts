export type PaymentMethodType =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CARD'
  | 'JAZZCASH'
  | 'EASYPAISA'
  | 'CRYPTO_BTC'
  | 'CRYPTO_USDT'
  | 'CRYPTO_ETH'
  | 'CUSTOM';

export type PaymentStatus = 'PAID' | 'PARTIALLY_PAID' | 'UNPAID' | 'OVERDUE';
export type ItemType = 'PHONE' | 'ACCESSORY';
export type DiscountRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'APPLIED' | 'EXPIRED';
export type CreditOverrideStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'USED';
export type WarrantyStatus = 'ACTIVE' | 'CLAIMED' | 'EXPIRED' | 'VOID';
export type WarrantyClaimStatus =
  | 'REGISTERED'
  | 'UNDER_INSPECTION'
  | 'APPROVED'
  | 'REJECTED'
  | 'SENT_TO_SUPPLIER'
  | 'UNDER_REPAIR'
  | 'REPAIRED'
  | 'REPLACEMENT'
  | 'REFUND'
  | 'READY_FOR_COLLECTION'
  | 'DELIVERED'
  | 'CLOSED';

export interface Customer {
  id: string;
  shopId: string;
  name: string;
  phone?: string;
  cnicMasked?: string | null;
  hasCnic?: boolean;
  email?: string;
  address?: string;
  creditLimit: number;
  outstandingBalance: number;
  availableCredit: number;
  status: 'ACTIVE' | 'INACTIVE';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerStatement {
  customer: {
    id: string;
    name: string;
    phone?: string;
    cnicMasked?: string;
    creditLimit: number;
    outstandingBalance: number;
    availableCredit: number;
  };
  sales: Array<{
    id: string;
    invoiceNo: string;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    amountPaid: number;
    balanceDue: number;
    paymentStatus: PaymentStatus;
    createdAt: string;
  }>;
  receipts: Array<{
    id: string;
    receiptNo: string;
    saleId: string;
    paymentMethod: string;
    amountReceived: number;
    previousBalance: number;
    remainingBalance: number;
    createdAt: string;
  }>;
}

export interface PosProductItem {
  id: string;
  itemType: ItemType;
  productName: string;
  identifier: string; // IMEI1 or SKU
  imei2?: string | null;
  barcode?: string | null;
  specs?: string;
  condition?: string;
  stockQuantity: number;
  defaultPrice: number;
  unitCost?: number;
  supplierName?: string;
}

export interface CartItem {
  id: string; // cart item row uuid
  productId: string;
  itemType: ItemType;
  productName: string;
  identifier: string;
  imei2?: string | null;
  specs?: string;
  condition?: string;
  stockAvailable: number;
  defaultPrice: number;
  actualPrice: number;
  quantity: number;
  subtotal: number;
  discountRequestId?: string | null;
  discountAmount?: number;
  warrantyMonths: number;
}

export interface SplitPaymentLine {
  id: string;
  paymentMethod: PaymentMethodType;
  amount: number;
  currency?: string;
  transactionReference?: string;
  notes?: string;
}

export interface CheckoutPayload {
  customerId?: string | null;
  customerName: string;
  customerPhone?: string;
  customerCnic?: string;
  items: Array<{
    itemType: ItemType;
    productId: string;
    quantity: number;
    actualPrice: number;
    discountRequestId?: string | null;
    warrantyMonths?: number;
  }>;
  payments: Array<{
    paymentMethod: PaymentMethodType;
    amount: number;
    currency?: string;
    exchangeRate?: number;
    transactionReference?: string;
    notes?: string;
  }>;
  dueDate?: string | null;
  creditOverrideId?: string | null;
  notes?: string;
}

export interface SaleSummary {
  id: string;
  invoiceNo: string;
  customerId?: string | null;
  customerName: string;
  customerPhone?: string;
  customerCnicMasked?: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxRate: number;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  grossProfit?: number;
  paymentStatus: PaymentStatus;
  dueDate?: string | null;
  shopkeeperName: string;
  isReversed?: boolean;
  createdAt: string;
}

export interface SaleDetails {
  sale: SaleSummary & { notes?: string };
  items: Array<{
    id: string;
    itemType: ItemType;
    phoneId?: string | null;
    accessoryId?: string | null;
    productName: string;
    identifier?: string;
    imei2?: string | null;
    specs?: string;
    condition?: string;
    quantity: number;
    unitCost: number;
    defaultPrice: number;
    actualPrice: number;
    discount: number;
    subtotal: number;
    profit: number;
    warrantyMonths: number;
  }>;
  payments: Array<{
    id: string;
    paymentMethod: PaymentMethodType;
    amount: number;
    currency: string;
    transactionReference?: string;
    notes?: string;
    createdAt: string;
  }>;
  receipts: Array<{
    id: string;
    receiptNo: string;
    paymentMethod: string;
    amountReceived: number;
    remainingBalance: number;
    createdAt: string;
  }>;
  warranties: Array<{
    id: string;
    productName: string;
    identifier: string;
    warrantyType: string;
    providerName: string;
    durationMonths: number;
    startDate: string;
    endDate: string;
    status: WarrantyStatus;
  }>;
}

export interface PaymentReceipt {
  id: string;
  receiptNo: string;
  saleId: string;
  invoiceNo: string;
  customerId: string;
  customerName: string;
  paymentMethod: string;
  amountReceived: number;
  previousBalance: number;
  remainingBalance: number;
  transactionReference?: string;
  receivedByName: string;
  notes?: string;
  createdAt: string;
}

export interface DiscountRequest {
  id: string;
  itemType: ItemType;
  productId: string;
  productName: string;
  defaultPrice: number;
  requestedPrice: number;
  discountAmount: number;
  reason: string;
  status: DiscountRequestStatus;
  requesterName: string;
  approverName?: string | null;
  approvedAmount?: number | null;
  rejectionReason?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface CreditOverride {
  id: string;
  customerId: string;
  customerName: string;
  saleAmount: number;
  creditLimit: number;
  currentBalance: number;
  excessAmount: number;
  status: CreditOverrideStatus;
  requesterName: string;
  approverName?: string | null;
  reason: string;
  createdAt: string;
  reviewedAt?: string | null;
}

export interface ReturnRecord {
  id: string;
  returnNo: string;
  saleId: string;
  invoiceNo: string;
  customerName: string;
  returnType: 'REFUND' | 'EXCHANGE';
  totalRefundAmount: number;
  reason: string;
  processorName: string;
  createdAt: string;
}

export interface WarrantyClaim {
  id: string;
  claimRef: string;
  warrantyId: string;
  invoiceNo: string;
  customerName: string;
  productName: string;
  identifier: string;
  problemDescription: string;
  status: WarrantyClaimStatus;
  repairNotes?: string;
  partsUsed?: string;
  laborCost?: number;
  customerCharge?: number;
  replacementImei?: string;
  registeredByName: string;
  resolvedByName?: string | null;
  createdAt: string;
  updatedAt: string;
}
