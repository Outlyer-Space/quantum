import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { resolveAuthFailure } from './auth-failure';

let isHandling401 = false;

/**
 * Intercepts every HTTP response.
 *
 * A 401 is not one thing. The API classifies each rejection and returns a code
 * (see node/server/lib/authCodes.js); this interceptor forwards that code to the
 * login page, which renders the matching explanation from auth-failure.ts.
 *
 * The only decision made here is whether to release the redirect guard, and it
 * is driven entirely by the failure's `retryable` flag rather than by testing
 * for particular codes:
 *
 *   retryable     -> signing in again could plausibly work (expiry, an untrusted
 *                    cookie, a signed-out session). The guard is released after a
 *                    few seconds so a genuine retry is possible.
 *   not retryable -> the login flow cannot fix it (no display name in Entra, a
 *                    deleted account, a tripped rate limiter). The guard stays
 *                    engaged, so the user gets one accurate explanation instead
 *                    of an endless redirect loop. Module state resets on reload,
 *                    so this is not sticky beyond the current page.
 *
 * Both paths redirect to the login page with an ?error= code it knows how to
 * render, so the explanation persists on screen rather than appearing in a
 * blocking alert the user dismisses and forgets.
 *
 * The /api/auth/me call during APP_INITIALIZER is excluded — a 401 there is the
 * normal "not yet logged in" state, not a failure.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const router = inject(Router);
    const authService = inject(AuthService);

    return next(req).pipe(
        catchError((error: unknown) => {
            if (
                error instanceof HttpErrorResponse &&
                (error.status === 401 || error.status === 429) &&
                !req.url.includes('/api/auth/me') &&
                !isHandling401
            ) {
                const code: string | undefined = error.error?.code;
                const failure = resolveAuthFailure(code);

                isHandling401 = true;
                authService.user.set(null);

                console.error(
                    `[auth] ${req.url} rejected (${code ?? 'no code — older server build'}): ${failure.diagnostic}`
                );

                router.navigate(['/'], { queryParams: { error: code ?? 'auth_failed' } });

                if (failure.retryable) {
                    setTimeout(() => { isHandling401 = false; }, 5000);
                }
            }
            return throwError(() => error);
        })
    );
};
