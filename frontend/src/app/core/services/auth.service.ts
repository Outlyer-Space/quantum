import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, map, tap } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { User } from '../models/user.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
    private http = inject(HttpClient);
    private router = inject(Router);

    /** Signal maintaining the current authenticated user's session */
    public user = signal<User | null>(null);

    /** The globally selected mission for the dashboard */
    public globalActiveMission = signal<string>('');

    /** Computed signal checking if the user's role in the global active mission is VIP */
    public isVip = computed(() => {
        const u = this.user();
        const missionName = this.globalActiveMission();
        if (!u || !u.missions || !missionName) return false;
        
        const m = u.missions.find(m => m.name === missionName);
        return m?.currentRole?.callsign === 'VIP';
    });

    /** Check if user is logged in by querying /api/auth/me */
    public initSession(): Observable<User> {
        return this.http.get<User>('/api/auth/me').pipe(
            tap(user => {
                this.user.set(user);
                this.initializeGlobalMission(user);
            }),
            catchError(err => {
                this.user.set(null);
                this.globalActiveMission.set('');
                return throwError(() => err);
            })
        );
    }

    private initializeGlobalMission(user: User): void {
        if (!user.missions || user.missions.length === 0) return;

        const savedMission = localStorage.getItem('globalActiveMission');
        const hasSaved = savedMission && user.missions.some(m => m.name === savedMission);

        if (hasSaved) {
            this.globalActiveMission.set(savedMission);
        } else if (!this.globalActiveMission()) {
            const first = user.missions[0].name || '';
            this.globalActiveMission.set(first);
            localStorage.setItem('globalActiveMission', first);
        }
    }

    /** 
     * Perform local login strategy via the modern JSON endpoint
     */
    public login(email: string, password: string): Observable<User> {
        return this.http.post<User>('/api/auth/login', { email, password }).pipe(
            tap((user) => {
                this.user.set(user);
                this.initializeGlobalMission(user);
                this.router.navigate(['/dashboard']);
            }),
            catchError((error: HttpErrorResponse) => {
                let errorMsg = 'Invalid email or password.';
                if (error.status === 401) {
                    errorMsg = 'Incorrect credentials. Please try again.';
                } else if (error.status >= 500) {
                    errorMsg = 'Server error. Please try again later.';
                }
                return throwError(() => new Error(errorMsg));
            })
        );
    }

    public logout(): void {
        this.http.post('/api/auth/logout', {}).subscribe({
            next: () => {
                this.user.set(null);
                this.globalActiveMission.set('');
                localStorage.removeItem('globalActiveMission');
                this.router.navigate(['/']);
            },
            error: () => {
                this.user.set(null);
                this.globalActiveMission.set('');
                localStorage.removeItem('globalActiveMission');
                this.router.navigate(['/']);
            }
        });
    }
 
    /**
     * Get active authentication provider configuration
     */
    public getAuthConfig(): Observable<{ provider: string }> {
        return this.http.get<{ provider: string }>('/api/auth/config');
    }

    /** 
     * Get user roles for a specific mission to map callsigns
     * Returns an array of users with their mission roles
     */
    public getUsersRoleStatus(mission: string): Observable<any[]> {
        return this.http.get<any[]>('/api/users/role-status', { params: { mission } });
    }
}
