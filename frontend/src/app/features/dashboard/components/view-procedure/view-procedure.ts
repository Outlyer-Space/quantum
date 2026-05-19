import {
    ChangeDetectionStrategy,
    Component,
    signal,
    computed,
    effect,
    inject,
    input,
    HostListener,
    OnDestroy,
    untracked,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { NavbarService } from '../../services/navbar.service';
import { ProcedureService } from '../../../../core/services/procedure.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ActiveUser, ProcedureData, ProcedureStep } from '../../../../core/models/procedure.model';
import {
    flattenSteps,
    buildInputFormControls,
    patchInputForm,
    getAllActionableSteps,
} from '../../utils/procedure-step.utils';
import { ProcedureStepTableComponent, StepCheckEvent } from '../procedure-step-table/procedure-step-table';

@Component({
    selector: 'app-view-procedure',
    imports: [CommonModule, ReactiveFormsModule, ProcedureStepTableComponent],
    templateUrl: './view-procedure.html',
    styleUrl: './view-procedure.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewProcedureComponent implements OnDestroy {

    // ── Services ──────────────────────────────────────────────────────────
    private router = inject(Router);
    private location = inject(Location);
    private nav = inject(NavbarService);
    private procedureService = inject(ProcedureService);
    private authService = inject(AuthService);

    // ── Router inputs (bound via withComponentInputBinding) ───────────────
    protected id = input<string>('');
    protected version = input<string | null>(null);
    protected revision = input<string | null>(null);
    /**
     * 'run'      → preview/pre-flight  (one-time fetch via getProcedureData)
     * 'running'  → live instance       (5s polling via getLiveInstanceData)
     * 'archived' → completed instance  (one-time fetch via getLiveInstanceData)
     */
    protected mode = input<'run' | 'running' | 'archived'>('run');

    // ── Computed mode flags ───────────────────────────────────────────────
    protected isRunningInstance = computed(() => this.mode() === 'running');
    protected isArchived = computed(() => this.mode() === 'archived');

    // ── Internal state ────────────────────────────────────────────────────
    private readonly LEAD_ROLES = ['FLIGHT', 'MD', 'TD'];
    private focusedControlId: string | null = null;
    protected inputForm = new FormGroup<Record<string, FormControl<string>>>({});

    /**
     * Tracks which procedure ID the form was last built for.
     * When id() changes → form is rebuilt from scratch.
     * On subsequent polls for the same id → form is patched (no-op currently).
     */
    private formBuiltForProcId = signal<string | null>(null);

    // ── Poll ticks ────────────────────────────────────────────────────────
    private readonly pollTick = toSignal(timer(0, 5000), { initialValue: 0 });
    private readonly usersPollTick = toSignal(timer(0, 20000), { initialValue: 0 });

    // ── Resources ─────────────────────────────────────────────────────────
    protected procedureResource = rxResource<ProcedureData, {
        id: string;
        revision: string | null;
        mode: 'run' | 'running' | 'archived';
        _poll: number;
        _refresh: number;
    }>({
        params: () => {
            const id = this.id();
            if (!id) return undefined as any;
            return {
                id,
                revision: this.revision(),
                mode: this.mode(),
                _poll: this.isRunningInstance() ? this.pollTick() : 0,
                _refresh: this.isRunningInstance() ? this.procedureService.refreshTick() : 0,
            };
        },
        stream: ({ params }) => {
            if (params.mode === 'run') {
                return this.procedureService.getProcedureData(params.id);
            }
            return this.procedureService.getLiveInstanceData(params.id, params.revision!);
        },
    });

    protected activeUsersResource = rxResource<ActiveUser[], {
        id: string;
        revision: string;
        _poll: number;
    }>({
        params: () => {
            if (!this.isRunningInstance()) return undefined as any;
            const id = this.id();
            const revision = this.revision();
            if (!id || !revision) return undefined as any;
            return { id, revision, _poll: this.usersPollTick() };
        },
        stream: ({ params }) => this.procedureService.getActiveUsers(params.id, params.revision),
    });

    // ── Local cache for stable step identity across polls ─────────────────

    /**
     * Holds the step tree that the template renders.
     * Populated on first load; mutated in-place on subsequent polls.
     */
    private localStepsCache: ProcedureStep[] | null = null;

    /**
     * Plain class property (NOT a signal) that records which procedure ID was
     * last used to populate `localStepsCache`.
     *
     * Why not a signal?
     * Writing to a signal inside a computed() causes Angular 21 to throw a
     * reactive cycle error. Since `lastRenderedProcId` is only ever read inside
     * this same computed (not in the template or any other reactive context), a
     * plain property is both correct and simpler.
     */
    private lastRenderedProcId: string | null = null;

    /**
     * The step tree exposed to the template.
     *
     * First load or procedure change → replace cache wholesale.
     * Poll tick for the same procedure → sync only changed `recordedValue`
     * fields, return a shallow copy of the same cached array so OnPush
     * re-evaluates bindings without destroying DOM nodes.
     */
    protected steps = computed(() => {
        const data = this.procedureResource.value();
        const id = this.id();
        if (!data?.steps?.length) return this.localStepsCache ?? [];

        if (!this.localStepsCache || this.lastRenderedProcId !== id) {
            // First load or navigated to a different procedure — replace cache
            this.localStepsCache = data.steps;
            this.lastRenderedProcId = id;          // plain property write — always safe in computed
            return this.localStepsCache;
        }

        // Background poll for the same procedure — sync only what changed.
        // Object references in localStepsCache are preserved; Angular's
        // @for + trackBy treats mutated rows as the same DOM node.
        this.syncStepValues(this.localStepsCache, data.steps);

        // Shallow copy signals a value change to computed consumers (so Angular
        // marks the view dirty) without creating new child objects.
        return [...this.localStepsCache];
    });

    /**
     * Recursively walks the stable cache tree and copies `recordedValue`
     * from the fresh server tree whenever it has changed.
     * Steps are matched by array index and id — if the structure has shifted
     * (shouldn't happen mid-session) the sync is skipped for safety.
     */
    private syncStepValues(target: ProcedureStep[], source: ProcedureStep[]): void {
        for (let i = 0; i < target.length; i++) {
            const t = target[i];
            const s = source[i];
            if (!t || !s || t.id !== s.id) continue;

            if (t.recordedValue !== s.recordedValue) {
                t.recordedValue = s.recordedValue;
            }
            if (t.children && s.children && t.children.length === s.children.length) {
                this.syncStepValues(t.children, s.children);
            }
        }
    }

    // ── Derived from steps ────────────────────────────────────────────────

    private stepsStructureKey = computed(() => {
        const ids = flattenSteps(this.steps()).map(s => s.id).join(',');
        const closed = [...this.closedSectionIds()].join(',');
        return ids + '|' + closed;
    });

    protected flattenedSteps = computed(() => {
        this.stepsStructureKey(); // read to establish dependency
        return untracked(() => flattenSteps(this.steps(), this.closedSectionIds()));
    });

    protected allActionableStepsCompleted = computed(() => {
        const actionable = flattenSteps(this.steps())
            .filter(s => !s.children || s.children.length === 0);
        if (actionable.length === 0) return false;
        return actionable.every(s => s.recordedValue && s.recordedValue.trim().length > 0);
    });

    protected canEditStep = (step: ProcedureStep): boolean => {
        const callsign = this.getUserCallsign();
        if (
            callsign &&
            !this.LEAD_ROLES.includes(callsign.toUpperCase()) &&
            !step.role.toUpperCase().includes(callsign.toUpperCase())
        ) {
            return false;
        }
        const all = getAllActionableSteps(this.steps());
        const idx = all.findIndex(s => s.flatIndex === step.flatIndex);
        if (idx === -1) return false;
        if (!step.recordedValue || step.recordedValue.trim().length === 0) {
            return all.slice(0, idx).every(s => s.recordedValue && s.recordedValue.trim().length > 0);
        }
        if (idx === all.length - 1) return true;
        return !all.slice(idx + 1).some(s => s.recordedValue && s.recordedValue.trim().length > 0);
    };

    // ── Effects ───────────────────────────────────────────────────────────

    constructor() {
        this.nav.showReturnBtn.set(true);

        // Effect 1: Sync sidebar view-state from route mode.
        effect(() => {
            const mode = this.mode();
            if (mode === 'archived') {
                this.nav.isArchived.set(true);
                this.nav.sidebarViewState.set('archived');
            } else if (mode === 'running') {
                this.nav.isArchived.set(false);
                this.nav.sidebarViewState.set('running');
            } else {
                this.nav.isArchived.set(false);
                this.nav.sidebarViewState.set('preview');
            }
        });

        // Effect 2: Keep sidebarProcedureId in sync with route :id param.
        effect(() => {
            this.nav.sidebarProcedureId.set(this.id() || null);
        });

        // Effect 3: Sync NavbarService title signals once resource resolves.
        effect(() => {
            const data = this.procedureResource.value();
            const id = this.id();
            const mode = this.mode();
            if (!data?.title) return;

            this.nav.procedureTitle.set(data.title);

            if (mode === 'archived') {
                this.nav.title.set(`Archive: ${data.title} (${id})`);
            } else if (mode === 'running') {
                this.nav.title.set(`Running: ${data.title} (${id})`);
            } else {
                this.nav.title.set(`Preview: ${data.title}`);
            }
        });

        // Effect 4: Sync active-users sidebar panel from its resource.
        // Calls setActiveUsers() rather than .set() so the NavbarService
        // reconciliation logic preserves object identity for unchanged users,
        // preventing the sidebar list from flickering on every 20s poll tick.
        effect(() => {
            const incoming = this.activeUsersResource.value();
            if (incoming) {
                this.nav.setActiveUsers(incoming);
            }
        });

        // Effect 5: Build or patch the input FormGroup when procedure data arrives.
        // formBuiltForProcId !== id  →  new procedure, build fresh FormGroup.
        // formBuiltForProcId === id  →  same procedure / poll update; patch only (currently no-op).
        effect(() => {
            const data = this.procedureResource.value();
            const id = this.id();
            if (!data?.steps?.length) return;

            if (this.formBuiltForProcId() !== id) {
                this.formBuiltForProcId.set(id);
                this.buildForm(data.steps);
            } else {
                patchInputForm(this.inputForm, data.steps, this.focusedControlId);
            }
        });

        // Effect 6: Send user-presence heartbeat for running instances.
        effect(() => {
            if (!this.isRunningInstance()) return;
            const id = this.id();
            const revision = this.revision();
            if (!id || !revision) return;

            const user = this.authService.user();
            const username = user?.auth?.name || 'Unknown User';
            const email = user?.auth?.email || '';
            this.procedureService
                .setUserStatus(id, revision, username, email, true)
                .subscribe({ error: err => console.warn('Could not set user presence:', err) });
        });
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────

    ngOnDestroy(): void {
        this.clearUserPresence();
        this.nav.sidebarViewState.set(null);
        this.nav.sidebarProcedureId.set(null);
        this.nav.clearActiveUsers();
        this.nav.procedureTitle.set('');
    }

    @HostListener('window:beforeunload')
    onBeforeUnload(): void {
        this.clearUserPresence();
    }

    // ── Section toggle ─────────────────────────────────────────────────────

    protected closedSectionIds = signal<Set<string>>(new Set());

    protected onStepToggled(step: ProcedureStep): void {
        this.closedSectionIds.update(set => {
            const newSet = new Set(set);
            if (newSet.has(step.id)) {
                newSet.delete(step.id);
            } else {
                newSet.add(step.id);
            }
            return newSet;
        });
    }

    // ── Step interaction handlers ─────────────────────────────────────────

    protected onInputSet(step: ProcedureStep): void {
        if (this.isArchived() || !this.canEditStep(step)) return;
        const ctrl = this.inputForm.controls[step.id] as FormControl<string>;
        if (!ctrl) return;
        const val = ctrl.value;
        if (!val || val.trim().length === 0) return;

        const previous = step.recordedValue;
        step.recordedValue = val;
        ctrl.reset('');

        const username = this.authService.user()?.auth?.name || 'Unknown User';
        this.procedureService.setStepValue(
            this.id(), this.revision()!, step.flatIndex, val, step.type, username
        ).subscribe({
            next: () => this.procedureService.requestRefresh(),
            error: (err) => {
                console.error('Failed to save step value:', err);
                step.recordedValue = previous;
            },
        });
        this.autoCompleteParents();
    }

    protected onInputCleared(step: ProcedureStep): void {
        if (this.isArchived() || !this.canEditStep(step) || !step.recordedValue) return;
        const previous = step.recordedValue;
        step.recordedValue = '';

        const username = this.authService.user()?.auth?.name || 'Unknown User';
        this.procedureService.setStepValue(
            this.id(), this.revision()!, step.flatIndex, '', step.type, username, ''
        ).subscribe({
            next: () => this.procedureService.requestRefresh(),
            error: (err) => {
                console.error('Failed to clear input value:', err);
                step.recordedValue = previous;
            },
        });
        this.autoCompleteParents();
    }

    protected onStepChecked({ step, event }: StepCheckEvent): void {
        if (!this.canEditStep(step)) {
            (event.target as HTMLInputElement).checked = !!step.recordedValue;
            return;
        }
        const checkbox = event.target as HTMLInputElement;
        const username = this.authService.user()?.auth?.name || 'Unknown User';

        if (checkbox.checked) {
            const now = new Date();
            const dayOfYear = this.getDayOfYear(now);
            const h = String(now.getUTCHours()).padStart(2, '0');
            const m = String(now.getUTCMinutes()).padStart(2, '0');
            const s = String(now.getUTCSeconds()).padStart(2, '0');
            const timestamp = `${now.getUTCFullYear()} - ${dayOfYear}.${h}:${m}:${s} UTC ${username}`;

            const previous = step.recordedValue;
            step.recordedValue = timestamp;
            this.autoCompleteParents();

            this.procedureService.setStepValue(
                this.id(), this.revision()!, step.flatIndex, '', step.type, username, timestamp
            ).subscribe({
                next: () => this.procedureService.requestRefresh(),
                error: (err) => {
                    console.error('Failed to save step completion:', err);
                    step.recordedValue = previous;
                    checkbox.checked = false;
                },
            });
        } else {
            const previous = step.recordedValue;
            step.recordedValue = '';
            this.autoCompleteParents();

            this.procedureService.setStepValue(
                this.id(), this.revision()!, step.flatIndex, '', step.type, username, ''
            ).subscribe({
                next: () => this.procedureService.requestRefresh(),
                error: (err) => {
                    console.error('Failed to rewind step:', err);
                    step.recordedValue = previous;
                    checkbox.checked = true;
                },
            });
        }
    }

    protected onControlFocused(stepId: string): void {
        this.focusedControlId = stepId;
    }

    protected onControlBlurred(): void {
        this.focusedControlId = null;
    }

    protected completeProcedure(): void {
        const id = this.id();
        const revision = this.revision();
        if (!id || !revision) return;
        if (!window.confirm('Are you sure you want to complete and archive this procedure?')) return;

        const username = this.authService.user()?.auth?.name || 'Unknown User';
        this.procedureService.completeInstance(id, revision, username).subscribe({
            next: () => {
                this.procedureService.requestRefresh();
                this.router.navigate(['/dashboard/archived', id]);
            },
            error: (err) => {
                console.error('Failed to complete procedure:', err);
                alert('An error occurred while trying to complete the procedure.');
            },
        });
    }

    protected goBack(): void {
        this.location.back();
    }

    // ── Private helpers ───────────────────────────────────────────────────

    private buildForm(steps: ProcedureStep[]): void {
        const controls = buildInputFormControls(steps);
        this.inputForm = new FormGroup(controls);
        if (this.isArchived()) {
            Object.values(this.inputForm.controls).forEach(c => c.disable());
        }
    }

    private getUserCallsign(): string | null {
        const user = this.authService.user();
        const mission = this.procedureResource.value()?.eventname ?? '';
        if (!user?.missions || !mission) return null;
        const userMission = user.missions.find(m => m.name?.toLowerCase() === mission.toLowerCase());
        return userMission?.currentRole?.callsign || null;
    }

    private clearUserPresence(): void {
        if (!this.isRunningInstance()) return;
        const user = this.authService.user();
        const username = user?.auth?.name || 'Unknown User';
        const email = user?.auth?.email || '';
        const id = this.id();
        const revision = this.revision();
        if (id && revision) {
            this.procedureService.setUserStatus(id, revision, username, email, false).subscribe();
        }
    }

    /**
     * Walks the CACHE tree (not the raw resource value) and marks parent steps
     * as completed or incomplete based on their children's state.
     *
     * Operating on `localStepsCache` is critical: it is what the template
     * renders, so mutations here are visible immediately without waiting for
     * the next poll tick to sync from the server.
     */
    private autoCompleteParents(): void {
        const steps = this.localStepsCache ?? [];
        const markParents = (list: ProcedureStep[]): void => {
            for (const step of list) {
                if (step.children && step.children.length > 0) {
                    markParents(step.children);
                    const allDone = step.children.every(
                        c => c.recordedValue && c.recordedValue.trim().length > 0
                    );
                    if (allDone && !step.recordedValue) {
                        const now = new Date();
                        const utcClock = `${this.getDayOfYear(now)}.${
                            String(now.getUTCHours()).padStart(2, '0')}:${
                            String(now.getUTCMinutes()).padStart(2, '0')}:${
                            String(now.getUTCSeconds()).padStart(2, '0')} UTC`;
                        step.recordedValue = utcClock;
                    } else if (!allDone && step.recordedValue) {
                        step.recordedValue = '';
                    }
                }
            }
        };
        markParents(steps);
    }

    private getDayOfYear(date: Date): string {
        const start = Date.UTC(date.getUTCFullYear(), 0, 0);
        const day = Math.floor((date.getTime() - start) / (1000 * 60 * 60 * 24));
        if (day < 10) return '00' + day;
        if (day < 100) return '0' + day;
        return String(day);
    }
}
