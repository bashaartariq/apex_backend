import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { PosComponent } from './features/pos/pos.component';
import { InventoryComponent } from './features/inventory/inventory.component';
import { CustomersComponent } from './features/customers/customers.component';
import { ReportsComponent } from './features/reports/reports.component';
import { OperationsComponent } from './features/operations/operations.component';
import { FoundationComponent } from './features/foundation/foundation.component';

const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    title: 'Dashboard Overview',
  },
  {
    path: 'pos',
    component: PosComponent,
    title: 'POS Express Register',
  },
  {
    path: 'inventory',
    component: InventoryComponent,
    title: 'Hardware & Accessories Inventory',
    children: [
      { path: 'phones', component: InventoryComponent, title: 'Mobile Phones Inventory' },
      { path: 'accessories', component: InventoryComponent, title: 'Accessories Catalog' },
      { path: 'purchases', component: InventoryComponent, title: 'Stock Inward & Purchases' },
      { path: 'suppliers', component: InventoryComponent, title: 'Hardware Suppliers' },
    ],
  },
  {
    path: 'customers',
    component: CustomersComponent,
    title: 'Customer Directory & Invoices',
  },
  {
    path: 'returns',
    component: OperationsComponent,
    title: 'Returns & Exchanges',
  },
  {
    path: 'warranty',
    component: OperationsComponent,
    title: 'Warranty & Repairs',
  },
  {
    path: 'reports',
    component: ReportsComponent,
    title: 'Reports & Analytics',
  },
  {
    path: 'settings',
    component: OperationsComponent,
    title: 'Store Settings',
  },
  {
    path: 'system',
    component: FoundationComponent,
    title: 'System & API Health',
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
