import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { SupplierItem } from '../models/inventory.models';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  total?: number;
}

@Injectable({
  providedIn: 'root',
})
export class SuppliersService {
  private readonly baseUrl = `${environment.apiUrl || '/api'}/suppliers`;

  constructor(private readonly http: HttpClient) {}

  getSuppliers(filters?: { status?: string; search?: string }): Observable<SupplierItem[]> {
    let params = new HttpParams();
    if (filters?.status && filters.status !== 'All') params = params.set('status', filters.status);
    if (filters?.search) params = params.set('search', filters.search);

    return this.http
      .get<ApiResponse<SupplierItem[]>>(this.baseUrl, { params })
      .pipe(map((res) => res.data));
  }

  getSupplier(id: string): Observable<SupplierItem & { recentPurchases?: any[] }> {
    return this.http
      .get<ApiResponse<SupplierItem & { recentPurchases?: any[] }>>(`${this.baseUrl}/${id}`)
      .pipe(map((res) => res.data));
  }

  createSupplier(payload: {
    name: string;
    contactPerson?: string;
    phone: string;
    email?: string;
    address?: string;
    businessId?: string;
    notes?: string;
  }): Observable<SupplierItem> {
    return this.http
      .post<ApiResponse<SupplierItem>>(this.baseUrl, payload)
      .pipe(map((res) => res.data));
  }

  updateSupplier(id: string, payload: Partial<SupplierItem>): Observable<SupplierItem> {
    return this.http
      .put<ApiResponse<SupplierItem>>(`${this.baseUrl}/${id}`, payload)
      .pipe(map((res) => res.data));
  }

  toggleStatus(id: string): Observable<SupplierItem> {
    return this.http
      .patch<ApiResponse<SupplierItem>>(`${this.baseUrl}/${id}/toggle-status`, {})
      .pipe(map((res) => res.data));
  }
}
