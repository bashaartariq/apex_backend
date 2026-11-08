import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppRoutingModule } from './app-routing.module';
import { CoreModule } from './core/core.module';
import { SharedModule } from './shared/shared.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { PosModule } from './features/pos/pos.module';
import { InventoryModule } from './features/inventory/inventory.module';
import { CustomersModule } from './features/customers/customers.module';
import { ReportsModule } from './features/reports/reports.module';
import { OperationsModule } from './features/operations/operations.module';
import { FoundationModule } from './features/foundation/foundation.module';
import { AppComponent } from './app.component';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    AppRoutingModule,
    CoreModule,
    SharedModule,
    DashboardModule,
    PosModule,
    InventoryModule,
    CustomersModule,
    ReportsModule,
    OperationsModule,
    FoundationModule,
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule {}
