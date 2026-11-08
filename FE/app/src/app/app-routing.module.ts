import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { PosComponent } from './features/pos/pos.component';
import { InventoryComponent } from './features/inventory/inventory.component';
import { CustomersComponent } from './features/customers/customers.component';
import { ReportsComponent } from './features/reports/reports.component';
import { OperationsComponent } from './features/operations/operations.component';
import { FoundationComponent } from './features/foundation/foundation.component';
import { LoginComponent } from './features/auth/login/login.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { AuthGuard } from './core/guards/auth.guard';
import { GuestGuard } from './core/guards/guest.guard';

const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [GuestGuard],
    title: 'Sign In — ApexCellular',
  },
  {
    path: 'register',
    component: RegisterComponent,
    canActivate: [GuestGuard],
    title: 'Shop Registration — ApexCellular',
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [AuthGuard],
    title: 'Dashboard Overview',
  },
  {
    path: 'pos',
    component: PosComponent,
    canActivate: [AuthGuard],
    title: 'POS Express Register',
  },
  {
    path: 'inventory',
    component: InventoryComponent,
    canActivate: [AuthGuard],
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
    canActivate: [AuthGuard],
    title: 'Customer Directory & Invoices',
  },
  {
    path: 'returns',
    component: OperationsComponent,
    canActivate: [AuthGuard],
    title: 'Returns & Exchanges',
  },
  {
    path: 'warranty',
    component: OperationsComponent,
    canActivate: [AuthGuard],
    title: 'Warranty & Repairs',
  },
  {
    path: 'reports',
    component: ReportsComponent,
    canActivate: [AuthGuard],
    title: 'Reports & Analytics',
  },
  {
    path: 'users',
    loadChildren: () => import('./features/users/users.module').then((m) => m.UsersModule),
  },
  {
    path: 'settings',
    loadChildren: () => import('./features/settings/settings.module').then((m) => m.SettingsModule),
  },
  {
    path: 'system',
    component: FoundationComponent,
    canActivate: [AuthGuard],
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
