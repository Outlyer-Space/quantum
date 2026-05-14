import { Injectable, signal } from '@angular/core';
import { ActiveUser } from '../../../core/models/procedure.model';

@Injectable({
    providedIn: 'root'
})
export class NavbarService {
    title = signal<string>('');
    showReturnBtn = signal<boolean>(false);
    isArchived = signal<boolean>(false);

    // ── Shared sidebar state (written by child views, read by layout) ──
    sidebarOpen = signal<boolean>(false);
    sidebarViewState = signal<'archived' | 'running' | 'preview' | null>(null);
    sidebarProcedureId = signal<string | null>(null);
    sidebarActiveUsers = signal<ActiveUser[]>([]);
    procedureTitle = signal<string>('');
}
