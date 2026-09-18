import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

let isHandling401 = false;

/** Reason codes the API attaches to a 401.
 *  Mirrors server/lib/ensureAuth.js and the /api/auth/me route. */
type AuthFailureCode = 'session_not_authenticated' | 'profile_name_invalid';

/**
 * Intercepts every HTTP response.
 *
 * A 401 is NOT always an expired session, and telling the user the wrong thing
 * sends them around a login loop that cannot possibly help them:
 *
 *   session_not_authenticated -> the session genuinely did not restore (cookie
 *                                signature or store). Signing in again is the
 *                                correct remedy, so the guard is released after
 *                                a few seconds to allow a retry.
 *   profile_name_invalid      -> the session is perfectly valid; the signed-in
 *                                account has no usable display name in Entra.
 *                                Signing in again changes nothing, so the guard
 *                                is deliberately NOT released — the user gets one
 *                                accurate explanation instead of a loop. (Module
 *                                state resets on reload, so this is not sticky
 *                                beyond the current page.)
 *
 * Both paths redirect to the login page with an ?error= code it already knows
 * how to render, so the explanation persists on screen rather than appearing in
 * a blocking alert the user dismisses and forgets.
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
                error.status === 401 &&
                !req.url.includes('/api/auth/me') &&
                !isHandling401
            ) {
                const code: AuthFailureCode | undefined = error.error?.code;
                isHandling401 = true;
                authService.user.set(null);

                if (code === 'profile_name_invalid') {
                    // Directory problem, not a session problem.
                    console.error(
                        `[auth] ${req.url} rejected: the signed-in account has no usable display ` +
                        'name in Microsoft Entra. This is a directory problem, not session expiry — ' +
                        'signing in again will not resolve it.'
                    );
                    router.navigate(['/'], { queryParams: { error: 'incomplete_profile' } });
                } else {
                    console.error(
                        `[auth] ${req.url} rejected: session did not restore ` +
                        `(${code ?? 'no reason code — older server build'}).`
                    );
                    router.navigate(['/'], { queryParams: { error: 'session_expired' } });
                    setTimeout(() => { isHandling401 = false; }, 5000);
                }
            }
            return throwError(() => error);
        })
    );
};
