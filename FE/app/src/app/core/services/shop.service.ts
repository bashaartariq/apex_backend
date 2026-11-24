import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Shop } from '../models/auth.models';

export interface ShopTaxSettings {
  taxEnabled: boolean;
  taxRate: number;
  taxName: string;
  isTaxInclusive: boolean;
  updatedAt?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class ShopService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  getProfile(): Observable<Shop> {
    return this.http
      .get<{ success: boolean; data: any }>(`${this.apiUrl}/shop/profile`, { withCredentials: true })
      .pipe(
        map((res) => ({
          ...res.data,
          ownerName: res.data.ownerName ?? res.data.owner_name ?? '',
        }))
      );
  }

  updateProfile(payload: {
    name: string;
    ownerName: string;
    phone: string;
    address: string;
  }): Observable<Shop> {
    return this.http
      .put<{ success: boolean; data: any }>(`${this.apiUrl}/shop/profile`, payload, {
        withCredentials: true,
      })
      .pipe(
        map((res) => ({
          ...res.data,
          ownerName: res.data.ownerName ?? res.data.owner_name ?? payload.ownerName,
        }))
      );
  }

  getTaxSettings(): Observable<ShopTaxSettings> {
    return this.http
      .get<{ success: boolean; data: ShopTaxSettings }>(`${this.apiUrl}/shop/tax-settings`, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data));
  }

  updateTaxSettings(payload: {
    taxEnabled: boolean;
    taxRate: number;
    taxName: string;
    isTaxInclusive: boolean;
  }): Observable<ShopTaxSettings> {
    return this.http
      .put<{ success: boolean; data: ShopTaxSettings }>(`${this.apiUrl}/shop/tax-settings`, payload, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data));
  }
}
