import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { HeaderComponent } from './components/header/header.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { StatusBadgeComponent } from './components/status-badge/status-badge.component';
import { ToastContainerComponent } from './components/toast/toast-container.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';
import { DeviceDetailDrawerComponent } from './components/device-detail-drawer/device-detail-drawer.component';
import { CnicMaskDirective } from './directives/cnic-mask.directive';
import { PhoneMaskDirective } from './directives/phone-mask.directive';
import { NumberOnlyDirective } from './directives/number-input.directive';

@NgModule({
  declarations: [
    HeaderComponent,
    SidebarComponent,
    StatusBadgeComponent,
    ToastContainerComponent,
    ConfirmDialogComponent,
    DeviceDetailDrawerComponent,
    CnicMaskDirective,
    PhoneMaskDirective,
    NumberOnlyDirective,
  ],
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
  ],
  exports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    FormsModule,
    HeaderComponent,
    SidebarComponent,
    StatusBadgeComponent,
    ToastContainerComponent,
    ConfirmDialogComponent,
    DeviceDetailDrawerComponent,
    CnicMaskDirective,
    PhoneMaskDirective,
    NumberOnlyDirective,
  ],
})
export class SharedModule {}
