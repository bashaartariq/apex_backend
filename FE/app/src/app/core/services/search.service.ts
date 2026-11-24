import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ApiService } from './api.service';
import { GlobalSearchResults } from '../models/search.models';

export interface SearchApiResponse {
  success: boolean;
  data: GlobalSearchResults;
  totalCount: number;
}

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  constructor(private readonly api: ApiService) {}

  search(query: string): Observable<GlobalSearchResults> {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      return of({
        phones: [],
        accessories: [],
        customers: [],
        sales: [],
        suppliers: [],
        totalCount: 0,
      });
    }

    return this.api.get<SearchApiResponse>('/search', { q: trimmed }).pipe(
      map((res) => res.data),
      catchError(() =>
        of({
          phones: [],
          accessories: [],
          customers: [],
          sales: [],
          suppliers: [],
          totalCount: 0,
        })
      )
    );
  }
}
