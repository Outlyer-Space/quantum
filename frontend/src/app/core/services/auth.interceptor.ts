import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Intercepts every HTTP response. On a 401, clears the user session and
 * redirects to the login page so the user is never left on a broken dashboard.
 *
 * The /api/auth/me call during APP_INITIALIZER is explicitly excluded —
 * a 401 there is the normal "not yet logged in" state, not a session expiry.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const router = inject(Router);
    const authService = inject(AuthService);

    return next(req).pipe(
        catchError((error: unknown) => {
            if (
                error instanceof HttpErrorResponse &&
                error.status === 401 &&
                !req.url.includes('/api/auth/me')
            ) {
                authService.user.set(null);
                router.navigate(['/']);
            }
            return throwError(() => error);
        })
    );
};
