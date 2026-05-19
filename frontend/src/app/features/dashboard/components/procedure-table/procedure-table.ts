import {
    ChangeDetectionStrategy,
    Component,
    signal,
    computed,
    effect,
    viewChild,
    inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { rxResource } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
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
export class ProcedureTableComponent {
    private procedureService = inject(ProcedureService);
    private authService = inject(AuthService);
    private router = inject(Router);

    // ── Poll tick ──────────────────────────────────────────────────────────
    /** Fires immediately, then every 5 s. Drives the resource re-fetch. */
    private readonly pollTick = toSignal(timer(0, 5000), { initialValue: 0 });

    // ── Resource ───────────────────────────────────────────────────────────
    /**
     * Replaces the legacy merge(timer, refresh$, missionChange$).pipe(switchMap…)
     * pattern. rxResource cancels in-flight requests automatically when params
     * change, so rapid mission-filter switches no longer race.
     */
    private proceduresResource = rxResource<ProcedureSummary[], {
        mission: string;
        _poll: number;
        _refresh: number;
    }>({
        params: () => ({
            mission: this.selectedMission(),
            _poll: this.pollTick(),
            _refresh: this.procedureService.refreshTick(),
        }),
        stream: ({ params }) =>
            this.procedureService.getProcedureList(params.mission || undefined),
    });

    // ── Stable local cache (the signal the template reads) ─────────────────
    /**
     * Holds the reconciled procedure list. Object references inside this array
     * are mutated in-place on each poll so Angular's trackBy never sees identity
     * changes for rows that haven't actually changed.
     */
    protected procedures = signal<ProcedureSummary[]>([]);

    // ── Filter / sort state ────────────────────────────────────────────────

    /** Missions available to the current user (deduplicated, original casing) */
    protected availableMissions = computed(() => {
        const missions = this.authService.user()?.missions ?? [];
        const unique = new Map<string, string>();
        missions.forEach(m => {
            if (m.name) unique.set(m.name.toLowerCase(), m.name);
        });
        return Array.from(unique.values());
    });

    /** Currently selected mission filter (empty string = show all) */
    protected selectedMission = signal<string>('');

    /** Search query bound to the search input */
    protected searchQuery = signal('');

    /** Sort state */
    protected sortField = signal<SortField>('id');
    protected sortReverse = signal(false);

    /** Derived: filtered-then-sorted view over the stable `procedures` signal */
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

    // ── Action feedback state ──────────────────────────────────────────────
    protected activeAction = signal<{ id: string; action: string } | null>(null);

    // ── Dialog children ────────────────────────────────────────────────────
    private editDialog = viewChild.required(EditProcedureDialogComponent);
    private downloadDialog = viewChild.required(DownloadProcedureDialogComponent);
    private downloadProcId = '';

    // ── Constructor / effects ──────────────────────────────────────────────

    constructor() {
        // Auto-select the mission when the user belongs to exactly one.
        // Runs once reactively; if auth resolves after construction this still fires.
        effect(() => {
            const missions = this.availableMissions();
            if (missions.length === 1 && !this.selectedMission()) {
                this.selectedMission.set(missions[0]);
            }
        });

        // Reconciliation effect: fires whenever the resource resolves with new data.
        // Mutates existing objects in-place so trackBy identity is preserved for
        // unchanged rows — no DOM work for rows that haven't changed.
        effect(() => {
            const incoming = this.proceduresResource.value();
            if (!incoming) return;

            this.procedures.update(existing => this.reconcileProcedures(existing, incoming));
        });
    }

    // ── Reconciliation ─────────────────────────────────────────────────────

    /**
     * Merges an incoming server snapshot into the existing stable array.
     *
     * Rules:
     *  - Existing row with no field changes  → return the same object reference (zero DOM work).
     *  - Existing row with changed fields    → mutate in-place, return same reference.
     *  - New row on server                  → append the new object.
     *  - Row removed from server            → filter it out.
     *
     * The result array preserves object identity for unchanged rows, which means
     * Angular's @for + trackBy emits zero DOM mutations for those rows.
     */
    private reconcileProcedures(
        existing: ProcedureSummary[],
        incoming: ProcedureSummary[]
    ): ProcedureSummary[] {
        const existingMap = new Map(existing.map(p => [p.id, p]));
        const incomingMap = new Map(incoming.map(p => [p.id, p]));

        let hasChanges = false;
        if (existing.length !== incoming.length) hasChanges = true;

        const reconciled = incoming.map((inc, index) => {
            const ex = existingMap.get(inc.id);

            // New procedure — no existing object to mutate
            if (!ex) {
                hasChanges = true;
                return inc;
            }

            if (existing[index]?.id !== inc.id) {
                hasChanges = true; // Order changed
            }

            // Nothing changed — return the exact same reference
            if (
                ex.title     === inc.title     &&
                ex.lastUse   === inc.lastUse   &&
                ex.running   === inc.running   &&
                ex.archived  === inc.archived  &&
                ex.eventname === inc.eventname
            ) {
                return ex;
            }

            hasChanges = true;
            // Something changed — mutate in-place and return the same reference.
            // Angular's trackBy sees the same object → only the changed text nodes
            // re-render, not the entire row.
            ex.title     = inc.title;
            ex.lastUse   = inc.lastUse;
            ex.running   = inc.running;
            ex.archived  = inc.archived;
            ex.eventname = inc.eventname;
            return ex;
        });

        if (!hasChanges) return existing;

        // Drop procedures that have been removed server-side
        return reconciled.filter(p => incomingMap.has(p.id));
    }

    // ── Template event handlers ────────────────────────────────────────────

    protected onMissionChange(value: string): void {
        // Updating selectedMission() automatically updates the resource params(),
        // which triggers an immediate re-fetch. No separate Subject needed.
        this.selectedMission.set(value);
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

    protected triggerAction(procId: string, action: string): void {
        if (this.activeAction()?.id === procId && this.activeAction()?.action === action) return;
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
                // Mutate the single renamed row in-place rather than spreading the
                // whole list — consistent with the reconciliation pattern.
                this.procedures.update(list => {
                    const target = list.find(p => p.id === data.originalId);
                    if (target) {
                        target.id    = data.id;
                        target.title = newTitle;
                    }
                    return [...list];
                });
                this.procedureService.requestRefresh();
            },
            error: (err) => console.error('Failed to rename procedure:', err),
        });
    }

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
            error: (err) => console.error('Failed to download procedure:', err),
        });
    }

    protected runProcedure(proc: ProcedureSummary): void {
        this.triggerAction(proc.id, 'start');

        const currentUser = this.authService.user();
        const username = currentUser?.auth.name || 'Unknown User';
        const email = currentUser?.auth.email || 'unknown@example.com';

        let status = 'VIP';
        if (currentUser?.missions && currentUser.missions.length > 0) {
            status = currentUser.missions[0].currentRole?.callsign || 'VIP';
        }

        this.procedureService.createInstance(proc.id, username, email, status).subscribe({
            next: (response) => {
                this.router.navigate([
                    '/dashboard/procedure/runninginstance',
                    proc.id, 1, response.revision,
                ]);
            },
            error: (err) => console.error('Failed to create running instance:', err),
        });
    }
}
