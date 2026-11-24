import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { WarrantyClaim } from '../models/pos.models';

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class WarrantyService {
  private readonly baseUrl = `${environment.apiUrl || '/api'}/warranty`;

  constructor(private readonly http: HttpClient) {}

  getWarranties(search?: string): Observable<any[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);

    return this.http.get<ApiResponse<any[]>>(this.baseUrl, { params }).pipe(map((res) => res.data));
  }

  getClaims(status?: string): Observable<WarrantyClaim[]> {
    let params = new HttpParams();
    if (status) params = params.set('status', status);

    return this.http.get<ApiResponse<WarrantyClaim[]>>(`${this.baseUrl}/claims`, { params }).pipe(map((res) => res.data));
  }

  createClaim(warrantyId: string, problemDescription: string): Observable<WarrantyClaim> {
    return this.http
      .post<ApiResponse<WarrantyClaim>>(`${this.baseUrl}/claims`, { warrantyId, problemDescription })
      .pipe(map((res) => res.data));
  }

  updateClaim(
    id: string,
    payload: {
      status: string;
      repairNotes?: string;
      partsUsed?: string;
      laborCost?: number;
      customerCharge?: number;
      replacementImei?: string;
    }
  ): Observable<WarrantyClaim> {
    return this.http.put<ApiResponse<WarrantyClaim>>(`${this.baseUrl}/claims/${id}`, payload).pipe(map((res) => res.data));
  }
}
