import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  route?: string;
  stageBadge?: string;
  isPlaceholder?: boolean;
}

@Component({
  selector: 'app-sidebar',
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent {
  @Input() isOpen = false;
  @Output() closeSidebar = new EventEmitter<void>();

  readonly navItems: readonly NavItem[] = [
    {
      id: 'foundation',
      label: 'System & Connectivity',
      icon: 'bi-hdd-network',
      route: '/',
      stageBadge: 'Step 1 Ready',
      isPlaceholder: false,
    },
    {
      id: 'inventory',
      label: 'Inventory & Devices',
      icon: 'bi-phone',
      stageBadge: 'Step 2',
      isPlaceholder: true,
    },
    {
      id: 'pos',
      label: 'Point of Sale (POS)',
      icon: 'bi-receipt-cutoff',
      stageBadge: 'Step 3',
      isPlaceholder: true,
    },
    {
      id: 'customers',
      label: 'Customers & Invoices',
      icon: 'bi-people',
      stageBadge: 'Step 4',
      isPlaceholder: true,
    },
    {
      id: 'reports',
      label: 'Tenant Reports & Admin',
      icon: 'bi-graph-up',
      stageBadge: 'Step 5',
      isPlaceholder: true,
    },
  ];

  onNavigate(): void {
    this.closeSidebar.emit();
  }
}
