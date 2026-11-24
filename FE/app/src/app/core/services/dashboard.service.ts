import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { AdminDashboardData, ShopkeeperDashboardData } from '../models/reports.models';

export interface DashboardApiResponse<T> {
  success: boolean;
  data: T;
}

@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  constructor(private readonly api: ApiService) {}

  getAdminDashboard(): Observable<DashboardApiResponse<AdminDashboardData>> {
    return this.api.get<DashboardApiResponse<AdminDashboardData>>('/dashboard/admin');
  }

  getShopkeeperDashboard(): Observable<DashboardApiResponse<ShopkeeperDashboardData>> {
    return this.api.get<DashboardApiResponse<ShopkeeperDashboardData>>('/dashboard/shopkeeper');
  }
}
