import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { BadgeTone } from '../status-badge/status-badge.component';
import { TenantContextService } from '../../../core/services/tenant-context.service';
import { ToastService } from '../../../core/services/toast.service';

export interface ShopTenantOption {
  id: string;
  name: string;
  location: string;
}

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss'],
})
export class HeaderComponent {
  @Input() appTitle = 'ApexCellular POS';
  @Input() sidebarOpen = false;
  @Input() sidebarCollapsed = false;
  @Input() apiConnected = false;
  @Input() apiChecking = false;
  @Input() activeShopId: string | null = null;

  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() toggleCollapse = new EventEmitter<void>();

  showNotifications = false;
  showProfileMenu = false;
  showShopSelector = false;

  readonly shops: ShopTenantOption[] = [
    { id: 'SHOP-DOWNTOWN-01', name: 'Downtown Flagship', location: 'Metropolitan Central' },
    { id: 'SHOP-UPTOWN-02', name: 'Uptown Mall Branch', location: 'Galleria Level 2' },
    { id: 'SHOP-AIRPORT-03', name: 'Airport Express Kiosk', location: 'Terminal 3 Gate B' },
  ];

  readonly notifications = [
    { id: 1, title: 'Low Stock Alert', text: 'Torras 9H Glass for iPhone 15 Pro is below min threshold (8 left).', time: '10m ago', icon: 'bi-exclamation-triangle text-warning' },
    { id: 2, title: 'New Stock Inward', text: 'Invoice #GRN-492 from Apex Global received (6 devices).', time: '1h ago', icon: 'bi-box-seam text-primary' },
    { id: 3, title: 'Warranty Registered', text: 'Customer Marcus Vance registered IMEI 354892019482711.', time: '2h ago', icon: 'bi-shield-check text-success' },
  ];

  constructor(
    private readonly tenantService: TenantContextService,
    private readonly toast: ToastService,
    private readonly router: Router
  ) {}

  get currentShopName(): string {
    const found = this.shops.find((s) => s.id === this.activeShopId);
    return found ? found.name : 'Downtown Flagship';
  }

  get connectionLabel(): string {
    if (this.apiChecking) return 'Checking DB...';
    return this.apiConnected ? 'API & SQLite Online' : 'API Offline';
  }

  get connectionTone(): BadgeTone {
    if (this.apiChecking) return 'warning';
    return this.apiConnected ? 'success' : 'danger';
  }

  switchShop(shop: ShopTenantOption): void {
    this.tenantService.setActiveShopId(shop.id);
    this.showShopSelector = false;
    this.toast.info('Store Context Switched', `Active store tenant set to ${shop.name} (${shop.id}).`);
  }

  onGlobalSearch(query: string): void {
    if (!query) return;
    this.toast.info('Global Search', `Filtered catalog and transactions for "${query}".`);
  }

  goToPos(): void {
    this.router.navigate(['/pos']);
  }
}
