import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { PurchaseRecord } from '../models/inventory.models';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  total?: number;
}

@Injectable({
  providedIn: 'root',
})
export class PurchasesService {
  private readonly baseUrl = `${environment.apiUrl || '/api'}/purchases`;

  constructor(private readonly http: HttpClient) {}

  getPurchases(filters?: { status?: string; supplierId?: string; search?: string }): Observable<PurchaseRecord[]> {
    let params = new HttpParams();
    if (filters?.status && filters.status !== 'All') params = params.set('status', filters.status);
    if (filters?.supplierId && filters.supplierId !== 'All') params = params.set('supplierId', filters.supplierId);
    if (filters?.search) params = params.set('search', filters.search);

    return this.http
      .get<ApiResponse<PurchaseRecord[]>>(this.baseUrl, { params })
      .pipe(map((res) => res.data));
  }

  getPurchase(id: string): Observable<PurchaseRecord> {
    return this.http
      .get<ApiResponse<PurchaseRecord>>(`${this.baseUrl}/${id}`)
      .pipe(map((res) => res.data));
  }

  createPurchase(payload: {
    supplierId: string;
    referenceNo: string;
    purchaseDate: string;
    taxAmount?: number;
    discountAmount?: number;
    notes?: string;
    autoConfirm?: boolean;
    items: Array<{
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
      condition?: 'NEW' | 'USED';
      sellingPrice?: number;
      accessoryId?: string;
      categoryId?: string;
      sku?: string;
      barcode?: string;
      notes?: string;
    }>;
  }): Observable<{ id: string; referenceNo: string; status: string }> {
    return this.http
      .post<ApiResponse<{ id: string; referenceNo: string; status: string }>>(this.baseUrl, payload)
      .pipe(map((res) => res.data));
  }

  confirmPurchase(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.baseUrl}/${id}/confirm`, {});
  }
}
