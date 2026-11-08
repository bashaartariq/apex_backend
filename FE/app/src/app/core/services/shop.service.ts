import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Shop } from '../models/auth.models';

@Injectable({
  providedIn: 'root',
})
export class ShopService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  getProfile(): Observable<Shop> {
    return this.http
      .get<{ success: boolean; data: Shop }>(`${this.apiUrl}/shop/profile`, { withCredentials: true })
      .pipe(map((res) => res.data));
  }

  updateProfile(payload: {
    name: string;
    ownerName: string;
    phone: string;
    address: string;
  }): Observable<Shop> {
    return this.http
      .put<{ success: boolean; data: Shop }>(`${this.apiUrl}/shop/profile`, payload, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data));
  }
}
