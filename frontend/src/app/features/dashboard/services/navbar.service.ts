import { Injectable, signal } from '@angular/core';
import { ActiveUser } from '../../../core/models/procedure.model';

@Injectable({
    providedIn: 'root'
})
export class NavbarService {
    title = signal<string>('');
    showReturnBtn = signal<boolean>(false);
    isArchived = signal<boolean>(false);

    // ── Shared sidebar state (written by child views, read by layout) ──────
    sidebarOpen = signal<boolean>(false);
    sidebarViewState = signal<'archived' | 'running' | 'preview' | null>(null);
    sidebarProcedureId = signal<string | null>(null);
    procedureTitle = signal<string>('');

    // ── Active users ───────────────────────────────────────────────────────

    /**
     * Private writable signal. Components read the public readonly view below;
     * all writes go through setActiveUsers() so reconciliation is enforced
     * at the service boundary rather than scattered across call sites.
     */
    private _sidebarActiveUsers = signal<ActiveUser[]>([]);

    /**
     * Public read-only view of the active users list.
     * The sidebar template binds to this; ViewProcedureComponent's Effect 4
     * calls setActiveUsers() to update it.
     */
    readonly sidebarActiveUsers = this._sidebarActiveUsers.asReadonly();

    /**
     * Reconcile-update the active-users list.
     *
     * Called from ViewProcedureComponent's Effect 4 on each 20-second poll.
     * Instead of replacing the array wholesale (which causes the sidebar's
     * online-users @for to re-render every row), this method:
     *
     *  - Returns the same object reference for users whose fields haven't changed
     *    → Angular's trackBy + OnPush skips those rows entirely.
     *  - Uses Object.assign into the existing object for users that have changed
     *    → only the affected text nodes re-render.
     *  - Appends genuinely new users.
     *  - Removes users no longer in the incoming list.
     *
     * Keyed on email, which is the stable unique identifier for a session user.
     */
    setActiveUsers(incoming: ActiveUser[]): void {
        this._sidebarActiveUsers.update(existing => {
            const existingMap = new Map(existing.map(u => [u.email, u]));
            const incomingEmails = new Set(incoming.map(u => u.email));

            let hasChanges = false;
            if (existing.length !== incoming.length) hasChanges = true;

            const reconciled = incoming.map((inc, index) => {
                const ex = existingMap.get(inc.email);

                // New user — no existing object to reuse
                if (!ex) {
                    hasChanges = true;
                    return inc;
                }

                if (existing[index]?.email !== inc.email) {
                    hasChanges = true; // Order changed
                }

                // Nothing changed — return the exact same reference so
                // Angular's trackBy sees no identity change on this row
                if (
                    ex.name     === inc.name     &&
                    ex.status   === inc.status   &&
                    ex.callsign === inc.callsign
                ) {
                    return ex;
                }

                hasChanges = true;
                // Fields changed — mutate in-place to preserve the reference
                return Object.assign(ex, inc);
            });

            if (!hasChanges) return existing;

            // Remove users who are no longer in the server's response
            return reconciled.filter(u => incomingEmails.has(u.email));
        });
    }

    /**
     * Clears the active users list. Called from ViewProcedureComponent.ngOnDestroy
     * to reset sidebar state when leaving a running instance.
     */
    clearActiveUsers(): void {
        this._sidebarActiveUsers.set([]);
    }
}
