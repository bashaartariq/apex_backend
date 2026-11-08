import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Router } from '@angular/router';
import { BadgeTone } from '../status-badge/status-badge.component';
import { TenantContextService } from '../../../core/services/tenant-context.service';
import { ToastService } from '../../../core/services/toast.service';
import { AuthService } from '../../../core/services/auth.service';

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

  readonly notifications = [
    { id: 1, title: 'Low Stock Alert', text: 'Torras 9H Glass for iPhone 15 Pro is below min threshold (8 left).', time: '10m ago', icon: 'bi-exclamation-triangle text-warning' },
    { id: 2, title: 'New Stock Inward', text: 'Invoice #GRN-492 from Apex Global received (6 devices).', time: '1h ago', icon: 'bi-box-seam text-primary' },
    { id: 3, title: 'Warranty Registered', text: 'Customer Marcus Vance registered IMEI 354892019482711.', time: '2h ago', icon: 'bi-shield-check text-success' },
  ];

  constructor(
    public readonly auth: AuthService,
    private readonly tenantService: TenantContextService,
    private readonly toast: ToastService,
    private readonly router: Router
  ) {}

  get currentShopName(): string {
    return this.auth.currentShop?.name || 'Mobile Phone Shop';
  }

  get currentShopId(): string {
    return this.auth.currentShop?.id || this.activeShopId || 'SHOP-DEFAULT';
  }

  get userInitials(): string {
    const name = this.auth.currentUser?.name || 'User';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  get connectionLabel(): string {
    if (this.apiChecking) return 'Checking DB...';
    return this.apiConnected ? 'API & SQLite Online' : 'API Offline';
  }

  get connectionTone(): BadgeTone {
    if (this.apiChecking) return 'warning';
    return this.apiConnected ? 'success' : 'danger';
  }

  goToPos(): void {
    this.router.navigate(['/pos']);
  }

  onGlobalSearch(query: string): void {
    if (!query) return;
    this.toast.info('Global Search', `Filtered catalog and transactions for "${query}".`);
  }

  logout(): void {
    this.showProfileMenu = false;
    this.auth.logout();
  }
}
