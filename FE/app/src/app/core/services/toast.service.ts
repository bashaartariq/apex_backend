import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface ToastMessage {
  id: string;
  type: 'success' | 'danger' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
  duration?: number;
}

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  private readonly toastsSubject = new BehaviorSubject<ToastMessage[]>([]);
  readonly toasts$: Observable<ToastMessage[]> = this.toastsSubject.asObservable();

  show(type: 'success' | 'danger' | 'warning' | 'info', title: string, message: string, duration = 4000): void {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newToast: ToastMessage = {
      id,
      type,
      title,
      message,
      timestamp: new Date(),
      duration,
    };

    const current = this.toastsSubject.value;
    this.toastsSubject.next([...current, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, duration);
    }
  }

  success(titleOrMessage: string, message?: string): void {
    if (message === undefined) {
      this.show('success', 'Success', titleOrMessage);
    } else {
      this.show('success', titleOrMessage, message);
    }
  }

  error(titleOrMessage: string, message?: string): void {
    if (message === undefined) {
      this.show('danger', 'Error', titleOrMessage, 6000);
    } else {
      this.show('danger', titleOrMessage, message, 6000);
    }
  }

  warning(titleOrMessage: string, message?: string): void {
    if (message === undefined) {
      this.show('warning', 'Warning', titleOrMessage);
    } else {
      this.show('warning', titleOrMessage, message);
    }
  }

  info(titleOrMessage: string, message?: string): void {
    if (message === undefined) {
      this.show('info', 'Information', titleOrMessage);
    } else {
      this.show('info', titleOrMessage, message);
    }
  }

  dismiss(id: string): void {
    this.toastsSubject.next(this.toastsSubject.value.filter((t) => t.id !== id));
  }
}
