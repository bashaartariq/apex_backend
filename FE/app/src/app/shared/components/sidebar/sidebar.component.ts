import { Component, EventEmitter, Input, OnInit, OnDestroy, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationsService } from '../../../core/services/notifications.service';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  route: string;
  description?: string;
  badge?: string;
  badgeColor?: string;
  permission?: string;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent implements OnInit, OnDestroy {
  @Input() isOpen = false;
  @Input() isCollapsed = false;
  @Input() activeShopId: string | null = null;
  @Output() closeSidebar = new EventEmitter<void>();

  navSections: NavSection[] = [];
  private lowStockCount = 0;
  private pendingApprovalsCount = 0;
  private readonly sub = new Subscription();

  private readonly rawSections: readonly NavSection[] = [
    {
      title: 'CORE PLATFORM',
      items: [
        {
          id: 'dashboard',
          label: 'Executive Overview',
          icon: 'bi-grid-1x2-fill',
          route: '/dashboard',
          description: 'Executive overview, KPI telemetry, and store activity',
          permission: 'dashboard.view',
        },
        {
          id: 'pos',
          label: 'POS Register',
          icon: 'bi-receipt-cutoff',
          route: '/pos',
          badge: 'Live',
          badgeColor: 'badge-brand',
          description: 'Point of sale checkout and barcode invoice register',
          permission: 'pos.access',
        },
      ],
    },
    {
      title: 'INVENTORY & HARDWARE',
      items: [
        {
          id: 'inventory',
          label: 'Inventory & IMEI',
          icon: 'bi-boxes',
          route: '/inventory',
          description: 'Phones, FIFO accessories, purchasing, suppliers & audits',
          permission: 'inventory.module',
        },
      ],
    },
    {
      title: 'CRM & AFTER-SALES',
      items: [
        {
          id: 'customers',
          label: 'Customers & Debt',
          icon: 'bi-people-fill',
          route: '/customers',
          description: 'Customer profiles, encrypted CNIC, and ledger balances',
          permission: 'customers.view',
        },
        {
          id: 'returns',
          label: 'Returns & Exchanges',
          icon: 'bi-arrow-left-right',
          route: '/returns',
          description: 'Manage sales returns, item exchanges, and customer refunds',
          permission: 'returns.manage',
        },
        {
          id: 'warranty',
          label: 'Warranty & Repairs',
          icon: 'bi-shield-check',
          route: '/warranty',
          description: 'Warranty coverage tracking, job cards, and repair workflow',
          permission: 'warranty.manage',
        },
      ],
    },
    {
      title: 'INTELLIGENCE & ADMIN',
      items: [
        {
          id: 'reports',
          label: 'Reports & Exports',
          icon: 'bi-bar-chart-line-fill',
          route: '/reports',
          description: 'Sales, gross margins, FIFO valuation, CSV & A4 PDF reports',
          permission: 'reports.view',
        },
        {
          id: 'users',
          label: 'Staff & Permissions',
          icon: 'bi-person-badge-fill',
          route: '/users',
          description: 'Manage staff accounts, roles, and 20 granular permissions',
          permission: 'users.manage',
        },
        {
          id: 'settings',
          label: 'Store & Tax Settings',
          icon: 'bi-sliders2',
          route: '/settings',
          description: 'Store profile, tenant identity, and POS tax configuration',
          permission: 'settings.manage',
        },
      ],
    },
  ];

  constructor(
    public readonly auth: AuthService,
    private readonly notifications: NotificationsService
  ) {}

  get canOpenPos(): boolean {
    return this.auth.isAdmin() || this.auth.hasPermission('pos.access');
  }

  ngOnInit(): void {
    this.buildNavSections();

    this.sub.add(
      this.auth.currentUser$.subscribe(() => {
        this.buildNavSections();
      })
    );

    this.sub.add(
      this.notifications.state$.subscribe((snap) => {
        const nextLow = snap.lowStockAccessories.length;
        const nextPending = snap.pendingDiscounts.length + snap.pendingCreditOverrides.length;
        if (nextLow !== this.lowStockCount || nextPending !== this.pendingApprovalsCount) {
          this.lowStockCount = nextLow;
          this.pendingApprovalsCount = nextPending;
          this.buildNavSections();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  buildNavSections(): void {
    if (!this.auth.currentUser) {
      this.navSections = [];
      return;
    }

    const decorate = (item: NavItem): NavItem => {
      if (item.id === 'inventory' && this.lowStockCount > 0) {
        return {
          ...item,
          badge: `${this.lowStockCount} Low`,
          badgeColor: 'badge-warning',
        };
      }
      if (item.id === 'pos' && this.pendingApprovalsCount > 0) {
        return {
          ...item,
          badge: `${this.pendingApprovalsCount} Req`,
          badgeColor: 'badge-warning',
        };
      }
      return item;
    };

    if (this.auth.isAdmin()) {
      this.navSections = this.rawSections.map((section) => ({
        ...section,
        items: section.items.map(decorate),
      }));
      return;
    }

    this.navSections = this.rawSections
      .map((section) => ({
        ...section,
        items: section.items
          .filter((item) => {
            if (!item.permission) return true;
            if (item.id === 'inventory') {
              return this.canAccessInventoryModule();
            }
            return this.auth.hasPermission(item.permission);
          })
          .map(decorate),
      }))
      .filter((section) => section.items.length > 0);
  }

  canAccessInventoryModule(): boolean {
    if (this.auth.isAdmin()) return true;
    const inventoryPermissions = [
      'inventory.view',
      'phones.view',
      'accessories.view',
      'purchases.view',
      'suppliers.view',
    ];
    return inventoryPermissions.some((perm) => this.auth.hasPermission(perm));
  }

  trackBySection(_index: number, section: NavSection): string {
    return section.title || String(_index);
  }

  trackByItem(_index: number, item: NavItem): string {
    return item.id || item.route;
  }

  onNavigate(): void {
    if (this.isOpen) {
      this.closeSidebar.emit();
    }
  }
}
