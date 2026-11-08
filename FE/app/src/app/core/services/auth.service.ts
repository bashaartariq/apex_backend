import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, map, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  RegisterResponse,
  Shop,
  User,
} from '../models/auth.models';
import { TenantContextService } from './tenant-context.service';
import { ToastService } from './toast.service';

const TOKEN_KEY = 'apex_access_token';
const USER_KEY = 'apex_user_session';
const SHOP_KEY = 'apex_shop_session';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiUrl = environment.apiUrl;
  private readonly currentUserSubject = new BehaviorSubject<User | null>(this.getStoredUser());
  private readonly currentShopSubject = new BehaviorSubject<Shop | null>(this.getStoredShop());
  private token: string | null = localStorage.getItem(TOKEN_KEY);

  readonly currentUser$: Observable<User | null> = this.currentUserSubject.asObservable();
  readonly currentShop$: Observable<Shop | null> = this.currentShopSubject.asObservable();
  readonly isAuthenticated$: Observable<boolean> = this.currentUser$.pipe(
    map((user) => user !== null)
  );

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly tenantContext: TenantContextService,
    private readonly toast: ToastService
  ) {
    // If session restored from localStorage, sync tenant context
    const currentShop = this.currentShopSubject.value;
    if (currentShop) {
      this.tenantContext.setActiveShopId(currentShop.id);
    }
  }

  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  get currentShop(): Shop | null {
    return this.currentShopSubject.value;
  }

  get accessToken(): string | null {
    return this.token;
  }

  get isAuthenticated(): boolean {
    return this.currentUserSubject.value !== null;
  }

  isAdmin(): boolean {
    return this.currentUserSubject.value?.role === 'SHOP_ADMIN';
  }

  hasPermission(permissionId: string): boolean {
    const user = this.currentUserSubject.value;
    if (!user) return false;
    if (user.role === 'SHOP_ADMIN') return true;
    return user.permissions?.includes(permissionId) || false;
  }

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.http
      .post<LoginResponse>(`${this.apiUrl}/auth/login`, credentials, { withCredentials: true })
      .pipe(
        tap((res) => {
          this.setSession(res.accessToken, res.user, res.shop);
          this.toast.success(`Welcome back, ${res.user.name}!`);
        })
      );
  }

  register(data: RegisterRequest): Observable<RegisterResponse> {
    return this.http
      .post<RegisterResponse>(`${this.apiUrl}/auth/register`, data, { withCredentials: true })
      .pipe(
        tap((res) => {
          this.setSession(res.accessToken, res.user, res.shop);
          this.toast.success(`Store "${res.shop.name}" registered successfully!`);
        })
      );
  }

  checkAuth(): Observable<boolean> {
    return this.http
      .get<{ success: boolean; user: User; shop: Shop }>(`${this.apiUrl}/auth/me`, {
        withCredentials: true,
      })
      .pipe(
        map((res) => {
          if (res.user && res.shop) {
            this.setSession(this.token || '', res.user, res.shop);
            return true;
          }
          this.clearSession();
          return false;
        }),
        catchError(() => {
          this.clearSession();
          return of(false);
        })
      );
  }

  logout(): void {
    this.http
      .post(`${this.apiUrl}/auth/logout`, {}, { withCredentials: true })
      .pipe(
        catchError(() => of(null)),
        tap(() => {
          this.clearSession();
          this.toast.info('You have been signed out.');
          this.router.navigate(['/login']);
        })
      )
      .subscribe();
  }

  updateLocalShop(shop: Shop): void {
    this.currentShopSubject.next(shop);
    localStorage.setItem(SHOP_KEY, JSON.stringify(shop));
  }

  private setSession(token: string, user: User, shop: Shop): void {
    this.token = token;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    }
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(SHOP_KEY, JSON.stringify(shop));

    this.currentUserSubject.next(user);
    this.currentShopSubject.next(shop);
    this.tenantContext.setActiveShopId(shop.id);
  }

  private clearSession(): void {
    this.token = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SHOP_KEY);
    this.currentUserSubject.next(null);
    this.currentShopSubject.next(null);
    this.tenantContext.setActiveShopId(null);
  }

  private getStoredUser(): User | null {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private getStoredShop(): Shop | null {
    try {
      const data = localStorage.getItem(SHOP_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }
}
