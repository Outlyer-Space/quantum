import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

export interface VersionInfo {
    version: string;
    branch: string;
    commit: string;
}

@Injectable({
    providedIn: 'root'
})
export class SystemService {
    private http = inject(HttpClient);

    /**
     * Gets the system version, branch, and commit info from the backend.
     */
    getVersionInfo(): Observable<VersionInfo> {
        return this.http.get<VersionInfo>('/api/version').pipe(
            catchError(err => {
                console.error('Failed to fetch system version info:', err);
                return of({
                    version: 'Error loading',
                    branch: 'Error loading',
                    commit: 'Error loading'
                });
            })
        );
    }
}
