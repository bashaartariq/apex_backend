import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateStaffRequest,
  PermissionDefinition,
  StaffUser,
  UpdateStaffRequest,
} from '../models/auth.models';

@Injectable({
  providedIn: 'root',
})
export class UserManagementService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private readonly http: HttpClient) {}

  listUsers(): Observable<StaffUser[]> {
    return this.http
      .get<{ success: boolean; data: StaffUser[] }>(`${this.apiUrl}/users`, { withCredentials: true })
      .pipe(map((res) => res.data));
  }

  createUser(payload: CreateStaffRequest): Observable<StaffUser> {
    return this.http
      .post<{ success: boolean; data: StaffUser }>(`${this.apiUrl}/users`, payload, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data));
  }

  getUser(id: string): Observable<StaffUser> {
    return this.http
      .get<{ success: boolean; data: StaffUser }>(`${this.apiUrl}/users/${id}`, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data));
  }

  updateUser(id: string, payload: UpdateStaffRequest): Observable<StaffUser> {
    return this.http
      .put<{ success: boolean; data: StaffUser }>(`${this.apiUrl}/users/${id}`, payload, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data));
  }

  updateStatus(id: string, status: 'ACTIVE' | 'INACTIVE'): Observable<{ id: string; status: string }> {
    return this.http
      .patch<{ success: boolean; data: { id: string; status: string } }>(
        `${this.apiUrl}/users/${id}/status`,
        { status },
        { withCredentials: true }
      )
      .pipe(map((res) => res.data));
  }

  getPermissionsCatalog(): Observable<PermissionDefinition[]> {
    return this.http
      .get<{ success: boolean; data: PermissionDefinition[] }>(`${this.apiUrl}/permissions`, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data));
  }

  getUserPermissions(userId: string): Observable<string[]> {
    return this.http
      .get<{ success: boolean; data: string[] }>(`${this.apiUrl}/users/${userId}/permissions`, {
        withCredentials: true,
      })
      .pipe(map((res) => res.data));
  }

  updateUserPermissions(userId: string, permissions: string[]): Observable<string[]> {
    return this.http
      .put<{ success: boolean; data: { userId: string; permissions: string[] } }>(
        `${this.apiUrl}/users/${userId}/permissions`,
        { permissions },
        { withCredentials: true }
      )
      .pipe(map((res) => res.data.permissions));
  }
}
