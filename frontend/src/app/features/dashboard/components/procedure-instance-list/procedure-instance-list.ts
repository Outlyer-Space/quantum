import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    inject,
    input,
    OnDestroy,
    signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { NavbarService } from '../../services/navbar.service';
import { ProcedureService } from '../../../../core/services/procedure.service';
import { ArchivedInstance, ProcedureInstance } from '../../../../core/models/procedure.model';

/**
 * Unified instance list component replacing both RunningInstancesComponent
 * and ArchivedInstancesComponent. Controlled via the `mode` input signal
 * injected from route data by withComponentInputBinding().
 */
@Component({
    selector: 'app-procedure-instance-list',
    imports: [CommonModule, RouterLink],
    templateUrl: './procedure-instance-list.html',
    styleUrl: './procedure-instance-list.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedureInstanceListComponent implements OnDestroy {

    // ── Services ──────────────────────────────────────────────────────────
    private nav = inject(NavbarService);
    private procedureService = inject(ProcedureService);

    // ── Router inputs (bound via withComponentInputBinding) ───────────────
    /** Procedure ID — from route param :id */
    protected id = input<string>('');
    /**
     * Operating mode — from route data (app.routes.ts).
     * 'running'  → show open instances with 5s polling
     * 'archived' → show completed instances with 5s polling
     */
    mode = input.required<'running' | 'archived'>();

    // ── Computed flags ────────────────────────────────────────────────────
    private isArchivedMode = computed(() => this.mode() === 'archived');

    // ── Poll tick ─────────────────────────────────────────────────────────
    private readonly pollTick = toSignal(timer(0, 5000), { initialValue: 0 });

    // ── Resource ──────────────────────────────────────────────────────────
    protected instancesResource = rxResource<{
        title: string;
        running: ProcedureInstance[];
        archived: ArchivedInstance[];
    }, { id: string; _poll: number; _refresh: number }>({
        params: () => {
            const id = this.id();
            if (!id) return undefined as any;
            return {
                id,
                _poll: this.pollTick(),
                _refresh: this.procedureService.refreshTick(),
            };
        },
        stream: ({ params }) => this.procedureService.getAllInstances(params.id),
    });

    // ── Stable local cache ────────────────────────────────────────────────
    /**
     * Holds reconciled running and archived instance arrays.
     *
     * The resource resolves to a fresh object graph on every poll tick.
     * This cache bridges between the raw HTTP data and the template,
     * preserving object identity for rows that haven't changed so that
     * Angular's trackBy + OnPush can skip those rows entirely.
     */
    private instancesCache = signal<{
        running: ProcedureInstance[];
        archived: ArchivedInstance[];
    }>({ running: [], archived: [] });

    // ── Computed from cache (what the template reads) ──────────────────────
    protected procedureTitle = computed(() => this.instancesResource.value()?.title ?? '');

    protected instances = computed<(ProcedureInstance | ArchivedInstance)[]>(() => {
        const cache = this.instancesCache();
        return this.isArchivedMode() ? cache.archived : cache.running;
    });

    // ── Effects ───────────────────────────────────────────────────────────

    constructor() {
        this.nav.showReturnBtn.set(true);

        // Effect 1: Sync sidebar view-state and isArchived flag from route mode.
        effect(() => {
            const isArchived = this.isArchivedMode();
            this.nav.isArchived.set(isArchived);
            this.nav.sidebarViewState.set(isArchived ? 'archived' : 'running');
        });

        // Effect 2: Keep sidebarProcedureId in sync with the route :id param.
        effect(() => {
            this.nav.sidebarProcedureId.set(this.id() || null);
        });

        // Effect 3: Sync NavbarService title signals when data resolves.
        effect(() => {
            const title = this.procedureTitle();
            const id = this.id();
            if (!title) return;

            this.nav.procedureTitle.set(title);
            this.nav.title.set(
                this.isArchivedMode()
                    ? `Archive List: ${title} (${id})`
                    : `Active Instances: ${title} (${id})`
            );
        });

        // Effect 4: Reconciliation — merge incoming server data into the stable
        // cache. Runs whenever the resource resolves with fresh data.
        //
        // This is intentionally an effect (not a computed) because it performs
        // a side-effectful mutation of the cache signal rather than a pure
        // derivation. Writing to a signal from inside a computed() is not
        // permitted in Angular 21 and would throw a cycle error.
        effect(() => {
            const data = this.instancesResource.value();
            if (!data) return;

            this.instancesCache.update(cache => ({
                running:  this.reconcileInstances(cache.running,  data.running),
                archived: this.reconcileInstances(cache.archived, data.archived) as ArchivedInstance[],
            }));
        });
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────

    ngOnDestroy(): void {
        this.nav.sidebarProcedureId.set(null);
        this.nav.sidebarViewState.set(null);
        this.nav.procedureTitle.set('');
    }

    // ── Reconciliation helper ─────────────────────────────────────────────

    /**
     * Merges an incoming instance list from the server into the existing
     * cached list, preserving object references wherever possible.
     *
     * Generic over T so it works for both ProcedureInstance and ArchivedInstance.
     *
     * Rules:
     *  - Same revision, nothing changed  → return the exact same object reference.
     *  - Same revision, field changed    → Object.assign into the existing object
     *                                      (same reference, Angular sees a field
     *                                      change only on that cell).
     *  - New revision                    → append the incoming object.
     *  - Revision no longer on server    → omit it (filter step at the end).
     */
    private reconcileInstances<T extends ProcedureInstance>(
        existing: T[],
        incoming: T[]
    ): T[] {
        const existingMap = new Map(existing.map(i => [i.revision, i]));
        const incomingRevisions = new Set(incoming.map(i => i.revision));

        let hasChanges = false;
        if (existing.length !== incoming.length) hasChanges = true;

        const reconciled = incoming.map((inc, index) => {
            const ex = existingMap.get(inc.revision);
            if (!ex) {
                hasChanges = true;
                return inc; // brand-new revision
            }

            if (existing[index]?.revision !== inc.revision) {
                hasChanges = true; // Order changed
            }

            // Check if any field actually changed before mutating
            const changed =
                ex.openedBy   !== inc.openedBy   ||
                ex.startedAt  !== inc.startedAt  ||
                ex.version    !== inc.version     ||
                // ArchivedInstance-specific fields (safe to access; undefined === undefined when missing)
                (ex as unknown as ArchivedInstance).closedBy      !== (inc as unknown as ArchivedInstance).closedBy      ||
                (ex as unknown as ArchivedInstance).completedAt   !== (inc as unknown as ArchivedInstance).completedAt;

            if (!changed) return ex; // same reference — Angular skips this row

            hasChanges = true;
            // Mutate in-place so trackBy still sees the same object identity
            Object.assign(ex, inc);
            return ex;
        });

        if (!hasChanges) return existing;

        // Drop revisions that have been removed from the server response
        return reconciled.filter(i => incomingRevisions.has(i.revision));
    }

    // ── Type guard ────────────────────────────────────────────────────────
    protected isArchived(instance: ProcedureInstance | ArchivedInstance): instance is ArchivedInstance {
        return this.mode() === 'archived';
    }
}
