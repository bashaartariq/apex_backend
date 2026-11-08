import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../../shared/shared.module';
import { PosComponent } from './pos.component';

@NgModule({
  declarations: [PosComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule.forChild([
      {
        path: '',
        component: PosComponent,
        title: 'POS Express Register',
      },
    ]),
    SharedModule,
  ],
  exports: [PosComponent],
})
export class PosModule {}
