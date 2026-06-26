import { Injectable, signal, inject } from '@angular/core';
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

    /** Check if user is logged in by querying /api/auth/me */
    public initSession(): Observable<User> {
        return this.http.get<User>('/api/auth/me').pipe(
            tap(user => this.user.set(user)),
            catchError(err => {
                this.user.set(null);
                return throwError(() => err);
            })
        );
    }

    /** 
     * Perform local login strategy via the modern JSON endpoint
     */
    public login(email: string, password: string): Observable<User> {
        return this.http.post<User>('/api/auth/login', { email, password }).pipe(
            tap((user) => {
                this.user.set(user);
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
                this.router.navigate(['/']);
            },
            error: () => {
                this.user.set(null);
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
