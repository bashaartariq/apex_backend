export interface AdminDashboardSummary {
  todaySalesRevenue: number;
  todaySalesCount: number;
  todayPurchasesExpenditure: number;
  todayPurchasesCount: number;
  monthlySalesRevenue: number;
  monthlyGrossProfit: number;
  prevMonthSalesRevenue: number;
  revenueGrowthPercentage: number;
  averageTransactionValue: number;
  totalInventoryValuation: number;
  phoneInventoryValuation: number;
  accessoryInventoryValuation: number;
  phonesInStockCount: number;
  newPhonesCount: number;
  usedPhonesCount: number;
  accessoriesInStockUnits: number;
  lowStockAccessoriesCount: number;
  totalCustomerReceivables: number;
  debtorsCount: number;
}

export interface DailySalesTrend {
  date: string;
  transactionsCount: number;
  revenue: number;
  profit: number;
}

export interface RecentSaleItem {
  id: string;
  invoiceNo: string;
  customerName: string;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;
  paymentStatus: string;
  createdAt: string;
}

export interface RecentPurchaseItem {
  id: string;
  purchaseNo: string;
  supplierName: string;
  totalAmount: number;
  status: string;
  date: string;
}

export interface RecentReceiptItem {
  id: string;
  receiptNo: string;
  invoiceNo: string;
  customerName: string;
  amountReceived: number;
  paymentMethod: string;
  createdAt: string;
}

export interface RecentReturnItem {
  id: string;
  returnNo: string;
  invoiceNo: string;
  returnType: string;
  refundAmount: number;
  reason: string;
  createdAt: string;
}

export interface TopProductItem {
  itemType: string;
  productName: string;
  unitsSold: number;
  totalRevenue: number;
  totalProfit: number;
}

export interface AdminDashboardData {
  summary: AdminDashboardSummary;
  dailyTrends: DailySalesTrend[];
  recentActivity: {
    sales: RecentSaleItem[];
    purchases: RecentPurchaseItem[];
    receipts: RecentReceiptItem[];
    returns: RecentReturnItem[];
  };
  topSellingProducts: TopProductItem[];
}

export interface ShopkeeperDashboardData {
  todayRegisterSales: number;
  todayRegisterTransactionsCount: number;
  myTodaySalesRevenue: number;
  myTodayTransactionsCount: number;
  availablePhonesCount: number;
  availableAccessoriesUnits: number;
  recentSales: Array<{
    id: string;
    invoiceNo: string;
    customerName: string;
    totalAmount: number;
    paymentStatus: string;
    createdAt: string;
  }>;
}

export interface ReportFilterParams {
  range?: string;
  dateFrom?: string;
  dateTo?: string;
  productType?: string;
  phoneCondition?: string;
  brand?: string;
  customerId?: string;
  shopkeeperId?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  supplierId?: string;
  status?: string;
  debtorsOnly?: string;
  search?: string;
  type?: string;
}

export interface SalesReportData {
  rangeLabel: string;
  summary: {
    totalTransactions: number;
    totalSubtotal: number;
    totalDiscounts: number;
    totalTax: number;
    totalSales: number;
    totalCollected: number;
    totalOutstanding: number;
    totalGrossProfit: number | null;
  };
  paymentBreakdown: Array<{
    paymentMethod: string;
    count: number;
    total: number;
  }>;
  sales: Array<{
    id: string;
    invoiceNo: string;
    customerName: string;
    customerPhone: string;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    totalAmount: number;
    amountPaid: number;
    balanceDue: number;
    grossProfit: number | null;
    paymentStatus: string;
    shopkeeperName: string;
    itemCount: number;
    createdAt: string;
  }>;
}

export interface PurchasesReportData {
  rangeLabel: string;
  summary: {
    totalOrders: number;
    totalExpenditure: number;
    totalTax: number;
    totalDiscounts: number;
  };
  supplierBreakdown: Array<{
    supplierName: string;
    ordersCount: number;
    totalSpent: number;
  }>;
  purchases: Array<{
    id: string;
    referenceNo: string;
    purchaseDate: string;
    status: string;
    totalAmount: number;
    taxAmount: number;
    discountAmount: number;
    supplierName: string;
    supplierPhone: string;
    itemCount: number;
    notes: string;
  }>;
}

export interface InventoryReportData {
  valuation: {
    totalValuation: number;
    phoneValuation: number;
    accessoryValuation: number;
    phonesInStockCount: number;
    newPhonesCount: number;
    usedPhonesCount: number;
    accessoriesUnitsCount: number;
    lowStockAccessoriesCount: number;
  } | null;
  phones: Array<{
    id: string;
    brand: string;
    model: string;
    imei1: string;
    imei2: string | null;
    ram: string;
    storage: string;
    color: string;
    condition: string;
    purchaseCost: number | null;
    sellingPrice: number;
    batteryHealth: number | null;
    physicalCondition: string | null;
    status: string;
    purchaseDate: string;
  }>;
  accessories: Array<{
    id: string;
    name: string;
    brand: string;
    model: string;
    sku: string;
    barcode: string;
    categoryName: string;
    purchaseCost: number | null;
    sellingPrice: number;
    availableQuantity: number;
    minStockThreshold: number;
    isLowStock: boolean;
    status: string;
  }>;
}

export interface ProfitReportData {
  rangeLabel: string;
  summary: {
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    returnsDeduction: number;
    returnsCount: number;
    netGrossProfit: number;
    profitMarginPct: number;
    totalUnitsSold: number;
  };
  typeBreakdown: Array<{
    itemType: string;
    unitsSold: number;
    revenue: number;
    cogs: number;
    profit: number;
    marginPct: number;
  }>;
  dailyProfit: Array<{
    date: string;
    revenue: number;
    cogs: number;
    profit: number;
  }>;
  lineItems: Array<{
    id: string;
    invoiceNo: string;
    saleDate: string;
    customerName: string;
    itemType: string;
    productName: string;
    condition: string;
    quantity: number;
    unitCost: number;
    actualPrice: number;
    discount: number;
    subtotal: number;
    profit: number;
    marginPct: number;
  }>;
}

export interface CustomerCreditReportData {
  summary: {
    totalCustomers: number;
    activeDebtors: number;
    totalOutstandingDebt: number;
    totalCreditLimit: number;
    overdueInvoicesCount: number;
    overdueAmount: number;
  };
  customers: Array<{
    id: string;
    name: string;
    phone: string;
    cnicMasked: string;
    creditLimit: number;
    outstandingBalance: number;
    availableCredit: number;
    overdueInvoicesCount: number;
    totalPurchased: number;
    totalPaid: number;
    status: string;
  }>;
}

export interface ReturnsWarrantyReportData {
  rangeLabel: string;
  summary: {
    totalReturnsCount: number;
    totalRefundAmount: number;
    totalClaimsCount: number;
    pendingClaimsCount: number;
    resolvedClaimsCount: number;
    totalRepairCosts: number;
  };
  returns: Array<{
    id: string;
    returnNo: string;
    invoiceNo: string;
    customerName: string;
    returnType: string;
    totalRefundAmount: number;
    reason: string;
    createdAt: string;
  }>;
  warrantyClaims: Array<{
    id: string;
    claimRef: string;
    invoiceNo: string;
    customerName: string;
    problemDescription: string;
    status: string;
    laborCost: number;
    customerCharge: number;
    createdAt: string;
    resolvedAt: string | null;
  }>;
}
