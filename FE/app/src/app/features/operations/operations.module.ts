import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { OperationsComponent } from './operations.component';

@NgModule({
  declarations: [OperationsComponent],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild([
      {
        path: '',
        component: OperationsComponent,
      },
    ]),
    SharedModule,
  ],
  exports: [OperationsComponent],
})
export class OperationsModule {}
