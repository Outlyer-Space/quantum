import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

export interface VersionInfo {
    version: string;
    branch: string;
    commit: string;
    dbUrl?: string;
    dbVersion?: string;
}

export interface SystemStatus {
    server: 'OKAY' | 'OFFLINE';
    database: 'OKAY' | 'OFFLINE';
    timestamp: string;
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

    /**
     * Gets the real-time server and database health status.
     */
    getSystemStatus(): Observable<SystemStatus> {
        return this.http.get<SystemStatus>('/api/status').pipe(
            catchError(err => {
                console.error('Failed to fetch system status:', err);
                return of({
                    server: 'OFFLINE',
                    database: 'OFFLINE',
                    timestamp: new Date().toISOString()
                } as SystemStatus);
            })
        );
    }
}
