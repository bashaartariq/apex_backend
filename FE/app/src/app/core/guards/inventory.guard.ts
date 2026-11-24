import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

@Injectable({
  providedIn: 'root',
})
export class InventoryGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly toast: ToastService
  ) {}

  canActivate(_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean | UrlTree {
    if (!this.auth.isAuthenticated) {
      return this.router.createUrlTree(['/login']);
    }

    if (this.auth.isTokenExpired()) {
      this.auth.handleSessionExpired(_state.url);
      return false;
    }

    if (this.auth.isAdmin()) {
      return true;
    }

    const inventoryPermissions = [
      'inventory.view',
      'phones.view',
      'accessories.view',
      'purchases.view',
      'suppliers.view',
    ];

    const hasAccess = inventoryPermissions.some((perm) => this.auth.hasPermission(perm));
    if (hasAccess) {
      return true;
    }

    this.toast.error('Access restricted: You do not have permission to view inventory modules.');
    return this.router.createUrlTree(['/dashboard']);
  }
}
