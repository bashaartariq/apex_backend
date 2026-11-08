import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { InventoryComponent } from './inventory.component';

@NgModule({
  declarations: [InventoryComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild([
      {
        path: '',
        component: InventoryComponent,
        title: 'Hardware & Accessories Inventory',
      },
      {
        path: 'phones',
        component: InventoryComponent,
        title: 'Mobile Phones Inventory',
      },
      {
        path: 'accessories',
        component: InventoryComponent,
        title: 'Accessories Catalog',
      },
      {
        path: 'purchases',
        component: InventoryComponent,
        title: 'Stock Inward & Purchases',
      },
      {
        path: 'suppliers',
        component: InventoryComponent,
        title: 'Hardware Suppliers',
      },
    ]),
    SharedModule,
  ],
  exports: [InventoryComponent],
})
export class InventoryModule {}
