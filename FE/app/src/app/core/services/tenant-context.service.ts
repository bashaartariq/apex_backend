import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Multi-tenant shop context foundation.
 * Holds the active shop_id discriminator once shop onboarding & authentication
 * are introduced in subsequent development steps.
 */
@Injectable({
  providedIn: 'root',
})
export class TenantContextService {
  private readonly activeShopIdSubject = new BehaviorSubject<string | null>(null);

  readonly activeShopId$: Observable<string | null> = this.activeShopIdSubject.asObservable();

  get currentShopId(): string | null {
    return this.activeShopIdSubject.value;
  }

  setActiveShopId(shopId: string | null): void {
    const trimmed = shopId?.trim() || null;
    this.activeShopIdSubject.next(trimmed);
  }
}
