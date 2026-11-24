import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type AppTheme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'apex_ui_theme';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly themeSubject = new BehaviorSubject<AppTheme>(this.resolveInitialTheme());
  readonly theme$: Observable<AppTheme> = this.themeSubject.asObservable();

  constructor() {
    this.applyTheme(this.themeSubject.value);
  }

  get currentTheme(): AppTheme {
    return this.themeSubject.value;
  }

  get isDark(): boolean {
    return this.themeSubject.value === 'dark';
  }

  toggle(): void {
    const next: AppTheme = this.isDark ? 'light' : 'dark';
    this.setTheme(next);
  }

  setTheme(theme: AppTheme): void {
    this.themeSubject.next(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage quota errors
    }
    this.applyTheme(theme);
  }

  private resolveInitialTheme(): AppTheme {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch {
      // Ignore storage access issues
    }
    return 'light';
  }

  private applyTheme(theme: AppTheme): void {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    const body = document.body;

    html.setAttribute('data-bs-theme', theme);
    html.setAttribute('data-ms-theme', theme);

    if (body) {
      body.classList.remove('theme-light', 'theme-dark');
      body.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light');
    }
  }
}

