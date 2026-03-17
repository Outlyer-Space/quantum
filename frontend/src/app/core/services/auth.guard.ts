import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Route guard to prevent unauthenticated users from accessing protected routes.
 * It checks the `AuthService` user signal. If empty, the user is redirected to the login page.
 */
export const authGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.user()) {
        return true;
    }

    // Redirect to login if unauthenticated
    return router.parseUrl('/');
};
