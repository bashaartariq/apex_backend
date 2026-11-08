import { NgModule, Optional, SkipSelf } from '@angular/core';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { TitleStrategy } from '@angular/router';
import { ApiRequestInterceptor } from './interceptors/api-request.interceptor';
import { AppTitleStrategy } from './services/app-title.strategy';

@NgModule({
  imports: [HttpClientModule],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: ApiRequestInterceptor,
      multi: true,
    },
    {
      provide: TitleStrategy,
      useClass: AppTitleStrategy,
    },
  ],
})
export class CoreModule {
  constructor(@Optional() @SkipSelf() parentModule?: CoreModule) {
    if (parentModule) {
      throw new Error('CoreModule is already loaded. Import it only once in AppModule.');
    }
  }
}
