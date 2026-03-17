import { ChangeDetectionStrategy, Component, signal, computed, viewChild, OnInit, OnDestroy, inject } from '@angular/core';
import { Subject, timer, merge } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { EditProcedureDialogComponent, EditProcedureData } from '../edit-procedure-dialog/edit-procedure-dialog';
import { DownloadProcedureDialogComponent } from '../download-procedure-dialog/download-procedure-dialog';
import { ProcedureService } from '../../../../core/services/procedure.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ProcedureSummary } from '../../../../core/models/procedure.model';

type SortField = 'id' | 'title' | 'lastUse' | 'running' | 'archived';

@Component({
    selector: 'app-procedure-table',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule, RouterModule, EditProcedureDialogComponent, DownloadProcedureDialogComponent],
    templateUrl: './procedure-table.html',
    styleUrl: './procedure-table.scss',
})
export class ProcedureTableComponent implements OnInit, OnDestroy {
    private procedureService = inject(ProcedureService);
    private authService = inject(AuthService);
    private router = inject(Router);
    private destroy$ = new Subject<void>();

    /** The raw list of procedures loaded from the backend */
    protected procedures = signal<ProcedureSummary[]>([]);

    /** Missions available to the current user (deduplicated, lowercase) */
    protected availableMissions = computed(() => {
        const missions = this.authService.user()?.missions ?? [];
        const unique = new Map<string, string>();
        missions.forEach(m => {
            if (m.name) unique.set(m.name.toLowerCase(), m.name);
        });
        return Array.from(unique.values());
    });

    /** Currently selected mission filter (empty = show all) */
    protected selectedMission = signal<string>('');

    /** Search query bound to the search input */
    protected searchQuery = signal('');

    /** Sort state */
    protected sortField = signal<SortField>('id');
    protected sortReverse = signal(false);

    /** Derived: filtered then sorted procedure list */
    protected filteredProcedures = computed(() => {
        const query = this.searchQuery().toLowerCase().trim();
        const list = query
            ? this.procedures().filter(p => p.title.toLowerCase().includes(query))
            : [...this.procedures()];

        const field = this.sortField();
        const reverse = this.sortReverse();

        list.sort((a, b) => {
            const aVal = a[field];
            const bVal = b[field];
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return aVal.localeCompare(bVal);
            }
            return (aVal as number) - (bVal as number);
        });

        if (reverse) list.reverse();
        return list;
    });

    /** Trigger used to re-fetch when selectedMission changes */
    private missionChange$ = new Subject<void>();

    ngOnInit(): void {
        // Auto-select mission only when the user has exactly one
        const missions = this.availableMissions();
        if (missions.length === 1) {
            this.selectedMission.set(missions[0]);
        }

        merge(
            timer(0, 5000),
            this.procedureService.refresh$,
            this.missionChange$
        ).pipe(
            switchMap(() => this.procedureService.getProcedureList(this.selectedMission() || undefined)),
            takeUntil(this.destroy$)
        ).subscribe({
            next: (procs) => this.procedures.set(procs),
            error: (err) => console.error('Failed to load procedures:', err)
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    protected onMissionChange(value: string): void {
        this.selectedMission.set(value);
        this.missionChange$.next();
    }

    protected onSearchInput(value: string): void {
        this.searchQuery.set(value);
    }

    protected toggleSort(field: SortField): void {
        if (this.sortField() === field) {
            this.sortReverse.update(r => !r);
        } else {
            this.sortField.set(field);
            this.sortReverse.set(false);
        }
    }

    /** Tracks which action button is currently showing the active feedback */
    protected activeAction = signal<{ id: string, action: string } | null>(null);

    protected triggerAction(procId: string, action: string): void {
        if (this.activeAction()?.id === procId && this.activeAction()?.action === action) {
            return;
        }

        this.activeAction.set({ id: procId, action });

        setTimeout(() => {
            if (this.activeAction()?.id === procId && this.activeAction()?.action === action) {
                this.activeAction.set(null);
            }
        }, 600);
    }

    protected isActive(procId: string, action: string): boolean {
        const current = this.activeAction();
        return current?.id === procId && current?.action === action;
    }

    private editDialog = viewChild.required(EditProcedureDialogComponent);

    protected openEditDialog(proc: ProcedureSummary): void {
        this.triggerAction(proc.id, 'rename');
        this.editDialog().open(proc);
    }

    protected saveProcedure(data: EditProcedureData): void {
        const originalProc = this.procedures().find(p => p.id === data.originalId);
        if (!originalProc) return;

        this.procedureService.renameProcedure(
            data.originalId,
            data.id,
            data.groupName,
            data.title
        ).subscribe({
            next: () => {
                const newTitle = data.groupName ? `${data.groupName} - ${data.title}` : data.title;
                this.procedures.update(list => list.map(p => {
                    if (p.id === data.originalId) {
                        return { ...p, id: data.id, title: newTitle };
                    }
                    return p;
                }));
                this.procedureService.requestRefresh();
            },
            error: (err) => console.error('Failed to rename procedure:', err)
        });
    }

    private downloadDialog = viewChild.required(DownloadProcedureDialogComponent);
    private downloadProcId = '';

    protected openDownloadDialog(proc: ProcedureSummary): void {
        this.triggerAction(proc.id, 'download');
        this.downloadProcId = proc.id;
        this.downloadDialog().open(proc.title);
    }

    protected performDownload(): void {
        this.procedureService.downloadProcedure(this.downloadProcId).subscribe({
            next: (blob) => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `procedure-${this.downloadProcId}.xlsx`;
                a.click();
                window.URL.revokeObjectURL(url);
            },
            error: (err) => console.error('Failed to download procedure:', err)
        });
    }

    protected runProcedure(proc: ProcedureSummary): void {
        this.triggerAction(proc.id, 'start');

        const currentUser = this.authService.user();
        const username = currentUser?.auth.name || 'Unknown User';
        const email = currentUser?.auth.email || 'unknown@example.com';

        // Find the user's primary role/callsign if available
        let status = 'VIP'; // Default fallback
        if (currentUser?.missions && currentUser.missions.length > 0) {
            status = currentUser.missions[0].currentRole?.callsign || 'VIP';
        }

        this.procedureService.createInstance(proc.id, username, email, status).subscribe({
            next: (response) => {
                const revision = response.revision;
                // Navigate to the dynamic live instance URL (defaulting version to 1 as per legacy code)
                this.router.navigate(['/dashboard/procedure/runninginstance', proc.id, 1, revision]);
            },
            error: (err) => console.error('Failed to create running instance:', err)
        });
    }
}
