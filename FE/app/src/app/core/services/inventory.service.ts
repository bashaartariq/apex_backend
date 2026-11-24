import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  AccessoryCategory,
  AccessoryItem,
  PhoneItem,
  StockMovement,
  StockSummary,
} from '../models/inventory.models';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  total?: number;
}

@Injectable({
  providedIn: 'root',
})
export class InventoryService {
  private readonly baseUrl = `${environment.apiUrl || '/api'}/inventory`;

  constructor(private readonly http: HttpClient) {}

  // 1. Stock Summary & FIFO Valuation
  getStockSummary(): Observable<StockSummary> {
    return this.http
      .get<ApiResponse<StockSummary>>(`${this.baseUrl}/stock-summary`)
      .pipe(map((res) => res.data));
  }

  // 2. Low-Stock Alerts
  getLowStock(): Observable<AccessoryItem[]> {
    return this.http
      .get<ApiResponse<AccessoryItem[]>>(`${this.baseUrl}/low-stock`)
      .pipe(map((res) => res.data));
  }

  // 3. Stock Movements Audit Log
  getMovements(filters?: { itemType?: string; movementType?: string; search?: string }): Observable<StockMovement[]> {
    let params = new HttpParams();
    if (filters?.itemType) params = params.set('itemType', filters.itemType);
    if (filters?.movementType) params = params.set('movementType', filters.movementType);
    if (filters?.search) params = params.set('search', filters.search);

    return this.http
      .get<ApiResponse<StockMovement[]>>(`${this.baseUrl}/movements`, { params })
      .pipe(map((res) => res.data));
  }

  // 4. Manual Stock Adjustments
  adjustStock(payload: {
    itemType: 'PHONE' | 'ACCESSORY';
    productId: string;
    newQuantity?: number;
    newStatus?: string;
    reason: string;
  }): Observable<{ success: boolean; message: string; adjustmentId: string }> {
    return this.http.post<{ success: boolean; message: string; adjustmentId: string }>(
      `${this.baseUrl}/adjustments`,
      payload
    );
  }

  // 5. Mobile Phones
  getPhones(filters?: {
    brand?: string;
    condition?: string;
    status?: string;
    supplierId?: string;
    search?: string;
  }): Observable<{ phones: PhoneItem[]; total: number }> {
    let params = new HttpParams();
    if (filters?.brand && filters.brand !== 'All') params = params.set('brand', filters.brand);
    if (filters?.condition && filters.condition !== 'All') params = params.set('condition', filters.condition);
    if (filters?.status && filters.status !== 'All') params = params.set('status', filters.status);
    if (filters?.supplierId && filters.supplierId !== 'All') params = params.set('supplierId', filters.supplierId);
    if (filters?.search) params = params.set('search', filters.search);

    return this.http
      .get<ApiResponse<PhoneItem[]>>(`${this.baseUrl}/phones`, { params })
      .pipe(map((res) => ({ phones: res.data, total: res.total || res.data.length })));
  }

  getPhone(id: string): Observable<{ phone: PhoneItem; movements: StockMovement[] }> {
    return this.http
      .get<ApiResponse<{ phone: PhoneItem; movements: StockMovement[] }>>(`${this.baseUrl}/phones/${id}`)
      .pipe(map((res) => res.data));
  }

  lookupImei(imei: string): Observable<PhoneItem> {
    return this.http
      .get<ApiResponse<PhoneItem>>(`${this.baseUrl}/phones/lookup/${imei.trim()}`)
      .pipe(map((res) => res.data));
  }

  createPhone(payload: Partial<PhoneItem>): Observable<PhoneItem> {
    return this.http
      .post<ApiResponse<PhoneItem>>(`${this.baseUrl}/phones`, payload)
      .pipe(map((res) => res.data));
  }

  updatePhone(id: string, payload: Partial<PhoneItem>): Observable<PhoneItem> {
    return this.http
      .put<ApiResponse<PhoneItem>>(`${this.baseUrl}/phones/${id}`, payload)
      .pipe(map((res) => res.data));
  }

  // 6. Accessories
  getAccessories(filters?: {
    categoryId?: string;
    lowStockOnly?: boolean;
    search?: string;
  }): Observable<{ accessories: AccessoryItem[]; total: number }> {
    let params = new HttpParams();
    if (filters?.categoryId && filters.categoryId !== 'All') params = params.set('categoryId', filters.categoryId);
    if (filters?.lowStockOnly) params = params.set('lowStockOnly', 'true');
    if (filters?.search) params = params.set('search', filters.search);

    return this.http
      .get<ApiResponse<AccessoryItem[]>>(`${this.baseUrl}/accessories`, { params })
      .pipe(map((res) => ({ accessories: res.data, total: res.total || res.data.length })));
  }

  getAccessory(id: string): Observable<AccessoryItem & { batches: any[]; movements: StockMovement[] }> {
    return this.http
      .get<ApiResponse<AccessoryItem & { batches: any[]; movements: StockMovement[] }>>(
        `${this.baseUrl}/accessories/${id}`
      )
      .pipe(map((res) => res.data));
  }

  createAccessory(payload: any): Observable<AccessoryItem> {
    return this.http
      .post<ApiResponse<AccessoryItem>>(`${this.baseUrl}/accessories`, payload)
      .pipe(map((res) => res.data));
  }

  updateAccessory(id: string, payload: any): Observable<AccessoryItem> {
    return this.http
      .put<ApiResponse<AccessoryItem>>(`${this.baseUrl}/accessories/${id}`, payload)
      .pipe(map((res) => res.data));
  }

  // 7. Accessory Categories
  getCategories(): Observable<AccessoryCategory[]> {
    return this.http
      .get<ApiResponse<AccessoryCategory[]>>(`${this.baseUrl}/accessories/categories`)
      .pipe(map((res) => res.data));
  }

  createCategory(name: string, code?: string): Observable<AccessoryCategory> {
    return this.http
      .post<ApiResponse<AccessoryCategory>>(`${this.baseUrl}/accessories/categories`, { name, code })
      .pipe(map((res) => res.data));
  }

  // 8. Printable Thermal Barcode Label PDF
  generateLabelPdf(itemType: 'PHONE' | 'ACCESSORY', productId: string): Observable<Blob> {
    const rootApi = environment.apiUrl || '/api';
    return this.http.post(
      `${rootApi}/products/generate-pdf`,
      { itemType, productId, labelFormat: 'STANDARD_50x30' },
      { responseType: 'blob' }
    );
  }
}
