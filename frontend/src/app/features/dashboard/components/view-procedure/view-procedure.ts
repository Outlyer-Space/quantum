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
import { ActiveUser, ProcedureData, ProcedureStep, StepEntityMap } from '../../../../core/models/procedure.model';
import {
    flattenSteps,
    buildInputFormControls,
    patchInputForm,
    getAllActionableSteps,
} from '../../utils/procedure-step.utils';
import { ProcedureStepTableComponent, StepCheckEvent } from '../procedure-step-table/procedure-step-table';
import { ArchiveSummaryDialogComponent } from '../archive-summary-dialog/archive-summary-dialog';
import { ProcedureStatusDialogComponent, DialogState } from '../procedure-status-dialog/procedure-status-dialog';
import { viewChild } from '@angular/core';

@Component({
    selector: 'app-view-procedure',
    imports: [CommonModule, ReactiveFormsModule, ProcedureStepTableComponent, ArchiveSummaryDialogComponent, ProcedureStatusDialogComponent],
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

    /**
     * Frozen to the last pollTick value once the procedure is discovered to be
     * closed — either via a 423 response (mid-edit) or via the poller finding
     * archiveSummary non-null. Prevents further 5-second refetches once the
     * procedure is no longer live.
     */
    private pollingFrozen = signal<boolean>(false);
    private frozenPollValue = signal<number>(0);

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
            const live = this.isRunningInstance();
            // Once pollingFrozen, keep _poll at its last seen value so the
            // resource never re-fetches on a timer tick. _refresh is intentionally
            // left open — requestRefresh() still works for the one archive detail fetch.
            const pollValue = live
                ? (this.pollingFrozen() ? this.frozenPollValue() : this.pollTick())
                : 0;
            return {
                id,
                revision: this.revision(),
                mode: this.mode(),
                _poll: pollValue,
                _refresh: live ? this.procedureService.refreshTick() : 0,
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

    // ── Entity-based step state ───────────────────────────────────────────

    /**
     * Immutable step tree structure loaded from the server on procedure load.
     * Contains id, role, type, content, flatIndex, children — everything except
     * mutable runtime values. Replaced wholesale on procedure navigation.
     */
    private stepShapes = signal<ProcedureStep[]>([]);

    /**
     * Mutable per-step state keyed by flatIndex.
     * Contains recordedValue, stepInfo, isPending, isLocked.
     * Being a signal, every write is immediately visible to Angular's reactivity
     * system — no manual bump counter required.
     */
    private stepState = signal<StepEntityMap>({});

    /**
     * Set to true the moment a 423 is received so the status dialog
     * opens immediately — before the re-fetch confirms the closed state.
     * Cleared on component destroy (navigation away).
     */
    private isLockedByClose = signal<boolean>(false);

    /**
     * Carries the server's message from the 423 response so the dialog
     * body reflects the real reason, not a hard-coded fallback.
     */
    private lockedMessage = signal<string>('');

    /**
     * Generic action error for non-423 failures (403, 409, network, etc.).
     * Kept separate so 423s can be promoted to the higher-priority 'locked' variant.
     */
    protected actionError = signal<{ title: string; message: string } | null>(null);

    /**
     * Plain class property tracking which procedure was last loaded into the
     * entity state. Read inside effects via untracked() to avoid reactive cycles.
     */
    private _lastLoadedProcId: string | null = null;

    /**
     * Flat indices updated by a remote poll (another client changed this step).
     * Drives the green flash animation on the row.
     */
    protected remotelyUpdatedSteps = signal<Set<number>>(new Set());

    /**
     * Flat indices whose write was explicitly rejected (409 Conflict).
     * Drives the yellow pulse animation on the row.
     */
    protected rejectedSteps = signal<Set<number>>(new Set());

    /**
     * Exposes pending step indices reactively to the template.
     * Derived directly from the entity map — no manual bump counter needed.
     */
    protected pendingUpdatesSignal = computed<Set<number>>(() => {
        const state = this.stepState();
        const pending = new Set<number>();
        for (const key of Object.keys(state)) {
            if (state[+key].isPending) pending.add(+key);
        }
        return pending;
    });

    /**
     * The step tree exposed to the template.
     * A pure merge of the immutable shape tree and the mutable entity state.
     * Re-evaluates automatically whenever either signal changes — no side-effects,
     * no mutation, no bump counter.
     */
    protected steps = computed(() =>
        this.mergeStepsWithState(this.stepShapes(), this.stepState())
    );

    // ── Derived from steps ────────────────────────────────────────────────

    protected flattenedSteps = computed(() => {
        return flattenSteps(this.steps(), this.closedSectionIds());
    });

    protected allActionableStepsCompleted = computed(() => {
        const actionable = flattenSteps(this.steps())
            .filter(s => !s.children || s.children.length === 0);
        if (actionable.length === 0) return false;
        return actionable.every(s => s.recordedValue && s.recordedValue.trim().length > 0);
    });

    protected isLeadRole = computed(() => {
        const callsign = this.getUserCallsign();
        return callsign ? this.LEAD_ROLES.includes(callsign.toUpperCase()) : false;
    });

    protected closingComment = signal<string>('');
    private cachedEventName = signal<string>('');

    protected archiveSummary = computed(() => this.procedureResource.value()?.archiveSummary ?? null);
    protected summaryDialog = viewChild(ArchiveSummaryDialogComponent);

    /**
     * Single source of truth for the status dialog.
     *
     * Priority (highest → lowest):
     *   1. 'locked'     — 423 received mid-edit; shown immediately, even before the
     *                     re-fetch confirms the closed state.
     *   2. 'uneditable' — poll discovered the procedure is no longer running.
     *   3. 'error'      — any other action failure (403, 409, network …).
     *   4. null         — dialog hidden.
     *
     * Because exactly one signal drives visibility, stacking is impossible by design.
     */
    protected dialogState = computed<DialogState | null>(() => {
        // Priority 1 — procedure was closed while this user was editing
        if (this.isLockedByClose()) {
            const summary = this.archiveSummary();
            return {
                variant: 'locked',
                title: 'Procedure Closed',
                message: this.lockedMessage() || 'This procedure was closed by another user. Your change was not saved.',
                archivedBy: summary?.closedBy || '',
                archivedAt: summary?.completedAt || '',
            };
        }

        // Priority 2 — poll discovered the procedure is no longer running
        if (this.mode() === 'running' && this.archiveSummary() !== null) {
            const summary = this.archiveSummary()!;
            return {
                variant: 'uneditable',
                title: 'Procedure No Longer Editable',
                message: 'This procedure has been closed and is now read-only.',
                archivedBy: summary.closedBy || 'Unknown User',
                archivedAt: summary.completedAt || '',
            };
        }

        // Priority 3 — generic action error
        const err = this.actionError();
        if (err) {
            return { variant: 'error', title: err.title, message: err.message };
        }

        return null;
    });

    protected openSummary(): void {
        const summary = this.archiveSummary();
        if (summary) {
            this.summaryDialog()?.open(summary);
        }
    }

    private handleError(err: any, defaultTitle: string, defaultMessage: string) {
        const serverMessage = err?.error?.message || err?.message || '';
        const status: number = err?.status ?? 0;

        if (status === 423) {
            if (this.isLockedByClose()) return;

            // Procedure was closed mid-edit.
            // Promote to the 'locked' dialog variant immediately (no wait for re-fetch).
            // Trigger a background refresh so archivedBy/archivedAt populate once available.
            this.lockedMessage.set(serverMessage || defaultMessage);
            this.isLockedByClose.set(true);

            if (!this.pollingFrozen()) {
                this.frozenPollValue.set(untracked(() => this.pollTick()));
                this.pollingFrozen.set(true);
            }

            this.procedureService.requestRefresh();
            return;
        }

        // Generic error path — resolve title from status code then surface via actionError.
        let title = defaultTitle;
        let message = serverMessage || defaultMessage;
        if (status === 403) title = 'Permission Denied';
        else if (status === 409) title = 'Conflict';
        else if (status === 401) title = 'Unauthorized';

        this.actionError.set({ title, message });
    }

    protected navigateToArchive() {
        this.router.navigate(['/dashboard/archived', this.id()]);
    }

    protected navigateToDashboard() {
        this.router.navigate(['/dashboard']);
    }

    /**
     * Wrapped in computed() so that a new function reference is produced
     * whenever steps() changes. This causes Angular to push a new value to
     * the child's canEdit input signal, forcing the child (OnPush) to
     * re-evaluate the locked/unlocked state of every step immediately after
     * an optimistic update — not just on the next poll tick.
     */
    protected canEditStep = computed(() => {
        const allSteps = this.steps(); // establishes reactive dependency
        return (step: ProcedureStep): boolean => {
            const callsign = this.getUserCallsign();
            if (callsign && !this.LEAD_ROLES.includes(callsign.toUpperCase())) {
                const allowedRoles = step.role.split(',').map(r => r.trim().toUpperCase());
                if (!allowedRoles.includes(callsign.toUpperCase())) {
                    return false;
                }
            }

            // Find the top-level section that contains this step
            let sectionSteps: ProcedureStep[] = [];
            for (const section of allSteps) {
                const actionableInSection = getAllActionableSteps([section]);
                if (actionableInSection.some(s => s.flatIndex === step.flatIndex)) {
                    sectionSteps = actionableInSection;
                    break;
                }
            }
            
            if (sectionSteps.length === 0) return false;

            const idx = sectionSteps.findIndex(s => s.flatIndex === step.flatIndex);
            if (idx === -1) return false;

            if (!step.recordedValue || step.recordedValue.trim().length === 0) {
                return sectionSteps.slice(0, idx).every(s => s.recordedValue && s.recordedValue.trim().length > 0);
            }
            
            if (idx === sectionSteps.length - 1) return true;
            return !sectionSteps.slice(idx + 1).some(s => s.recordedValue && s.recordedValue.trim().length > 0);
        };
    });

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
            // Write the active mission so the navbar and settings dialog can
            // derive the correct callsign without defaulting to missions[0].
            if (data.eventname) {
                this.nav.activeMission.set(data.eventname.toLowerCase());
                this.cachedEventName.set(data.eventname);
            }

            if (mode === 'archived' && data.closingComment) {
                this.closingComment.set(data.closingComment);
            }

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

        // Effect 6: Sync server poll data into the entity state.
        // On first load for a procedure: build the entity map from scratch.
        // On subsequent polls: diff only changed non-locked entries and update the map.
        // stepState is read with untracked() so this effect is only triggered by
        // the resource changing, not by our own writes to stepState.
        effect(() => {
            const data = this.procedureResource.value();
            const id = this.id();
            if (!data?.steps?.length) return;

            if (this._lastLoadedProcId !== id) {
                // New procedure — build entity state from scratch
                this._lastLoadedProcId = id;
                this.stepShapes.set(data.steps);
                this.stepState.set(this.buildEntityMap(data.steps));
                this.remotelyUpdatedSteps.set(new Set());
                this.rejectedSteps.set(new Set());
                return;
            }

            // Same procedure poll — sync only changed, non-locked entries
            const currentState = untracked(() => this.stepState());
            const { map, changed } = this.syncEntityMap(currentState, data.steps);

            if (changed.size > 0) {
                this.stepState.set(map);
                this.remotelyUpdatedSteps.update(prev => {
                    const next = new Set(prev);
                    changed.forEach(i => next.add(i));
                    return next;
                });
                // Clear yellow conflict pulses for remotely-updated steps
                this.rejectedSteps.update(prev => {
                    const next = new Set(prev);
                    let modified = false;
                    changed.forEach(i => { if (next.has(i)) { next.delete(i); modified = true; } });
                    return modified ? next : prev;
                });
                // Auto-fade green pulse after 100ms
                changed.forEach(i => {
                    setTimeout(() => {
                        this.remotelyUpdatedSteps.update(prev => {
                            const next = new Set(prev);
                            next.delete(i);
                            return next;
                        });
                    }, 100);
                });
            } else if (map !== currentState) {
                // Lock releases only — no visual change, but state needs updating
                this.stepState.set(map);
            }
        });

        // Effect 7: Send user-presence heartbeat for running instances.
        effect(() => {
            if (!this.isRunningInstance()) return;
            const id = this.id();
            const revision = this.revision();
            if (!id || !revision) return;

            this.procedureService
                .setUserStatus(id, revision, true)
                .subscribe({ error: err => console.warn('Could not set user presence:', err) });
        });

        // Effect 8: Freeze the poll the moment archiveSummary becomes non-null.
        // This covers the "uneditable" path — where the poller discovers the procedure
        // was closed without this user triggering a 423. Once frozen, _poll stops
        // advancing and the resource never refetches on a timer tick.
        effect(() => {
            if (this.archiveSummary() !== null && !this.pollingFrozen()) {
                this.frozenPollValue.set(untracked(() => this.pollTick()));
                this.pollingFrozen.set(true);
            }
        });
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────

    ngOnDestroy(): void {
        this.clearUserPresence();
        this.nav.sidebarViewState.set(null);
        this.nav.sidebarProcedureId.set(null);
        this.nav.activeMission.set(null);
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
        if (this.isArchived() || !this.canEditStep()(step)) return;

        const user = this.authService.user();
        if (!user || !user.auth?.name) {
            alert('Your session appears to be invalid or expired. Please log in again to continue.');
            this.authService.logout();
            return;
        }

        const ctrl = this.inputForm.controls[step.id] as FormControl<string>;
        if (!ctrl) return;
        const val = ctrl.value;
        if (!val || val.trim().length === 0) return;

        const previousInfo = step.stepInfo ?? '';
        const role = this.getUserCallsign();
        const displayRole = role && role !== 'VIP' ? ` (${role})` : (role === 'VIP' ? ' (VIP)' : '');
        const timestamp = `${new Date().toISOString()} ${user.auth.name}${displayRole}`;
        const flatIndex = step.flatIndex;

        // Pessimistic: only mark as pending — do NOT change the displayed value yet.
        this.stepState.update(map => ({
            ...map,
            [flatIndex]: { ...map[flatIndex], isPending: true, isLocked: true },
        }));

        this.procedureService.setStepValue(
            this.id(), this.revision()!, flatIndex, val, step.type, timestamp, previousInfo
        ).subscribe({
            next: () => {
                // Server confirmed — now apply the value and clear the textarea.
                this.stepState.update(map => ({
                    ...map,
                    [flatIndex]: { recordedValue: val, stepInfo: timestamp, isPending: false, isLocked: false },
                }));
                ctrl.reset('');
                this.autoCompleteParents();
            },
            error: (err) => {
                // Nothing to revert — just clear the pending state.
                this.stepState.update(map => ({
                    ...map,
                    [flatIndex]: { ...map[flatIndex], isPending: false, isLocked: false },
                }));
                if (err?.status === 409) {
                    this.rejectedSteps.update(prev => { const s = new Set(prev); s.add(flatIndex); return s; });
                    setTimeout(() => {
                        this.rejectedSteps.update(prev => { const s = new Set(prev); s.delete(flatIndex); return s; });
                    }, 100);
                    this.procedureService.requestRefresh();
                }
                this.handleError(err, 'Error', 'Failed to save step value.');
            },
        });
    }

    protected onInputCleared(step: ProcedureStep): void {
        if (this.isArchived() || !this.canEditStep()(step)) return;

        const user = this.authService.user();
        if (!user || !user.auth?.name) {
            alert('Your session appears to be invalid or expired. Please log in again to continue.');
            this.authService.logout();
            return;
        }

        if (!step.recordedValue) return;

        const previousInfo = step.stepInfo ?? '';
        const flatIndex = step.flatIndex;

        // Pessimistic: only mark as pending — do NOT clear the displayed value yet.
        this.stepState.update(map => ({
            ...map,
            [flatIndex]: { ...map[flatIndex], isPending: true, isLocked: true },
        }));

        this.procedureService.setStepValue(
            this.id(), this.revision()!, flatIndex, '', step.type, '', previousInfo
        ).subscribe({
            next: () => {
                // Server confirmed — now clear the value.
                this.stepState.update(map => ({
                    ...map,
                    [flatIndex]: { recordedValue: '', stepInfo: '', isPending: false, isLocked: false },
                }));
                this.autoCompleteParents();
            },
            error: (err) => {
                // Nothing to revert — just clear the pending state.
                this.stepState.update(map => ({
                    ...map,
                    [flatIndex]: { ...map[flatIndex], isPending: false, isLocked: false },
                }));
                if (err?.status === 409) {
                    this.rejectedSteps.update(prev => { const s = new Set(prev); s.add(flatIndex); return s; });
                    setTimeout(() => {
                        this.rejectedSteps.update(prev => { const s = new Set(prev); s.delete(flatIndex); return s; });
                    }, 100);
                    this.procedureService.requestRefresh();
                }
                this.handleError(err, 'Error', 'Failed to clear input value.');
            },
        });
    }

    protected onStepChecked({ step, action }: StepCheckEvent): void {
        if (!this.canEditStep()(step)) return;

        const user = this.authService.user();
        if (!user || !user.auth?.name) {
            alert('Your session appears to be invalid or expired. Please log in again to continue.');
            this.authService.logout();
            return;
        }

        const role = this.getUserCallsign();
        const displayRole = role && role !== 'VIP' ? ` (${role})` : (role === 'VIP' ? ' (VIP)' : '');
        const flatIndex = step.flatIndex;
        const previousValue = step.recordedValue ?? '';

        if (action === 'complete') {
            const timestamp = `${new Date().toISOString()} ${user.auth.name}${displayRole}`;

            // Pessimistic: only mark as pending — do NOT apply the timestamp yet.
            this.stepState.update(map => ({
                ...map,
                [flatIndex]: { ...map[flatIndex], isPending: true, isLocked: true },
            }));

            this.procedureService.setStepValue(
                this.id(), this.revision()!, flatIndex, '', step.type, timestamp, previousValue
            ).subscribe({
                next: () => {
                    // Server confirmed — now apply the completion timestamp.
                    this.stepState.update(map => ({
                        ...map,
                        [flatIndex]: { recordedValue: timestamp, stepInfo: '', isPending: false, isLocked: false },
                    }));
                    this.autoCompleteParents();
                },
                error: (err) => {
                    // Nothing to revert — just clear the pending state.
                    this.stepState.update(map => ({
                        ...map,
                        [flatIndex]: { ...map[flatIndex], isPending: false, isLocked: false },
                    }));
                    if (err?.status === 409) {
                        this.rejectedSteps.update(prev => { const s = new Set(prev); s.add(flatIndex); return s; });
                        setTimeout(() => {
                            this.rejectedSteps.update(prev => { const s = new Set(prev); s.delete(flatIndex); return s; });
                        }, 100);
                        this.procedureService.requestRefresh();
                    }
                    this.handleError(err, 'Error', 'Failed to save step interaction.');
                },
            });
        } else if (action === 'rewind') {
            // Pessimistic: only mark as pending — do NOT clear the value yet.
            this.stepState.update(map => ({
                ...map,
                [flatIndex]: { ...map[flatIndex], isPending: true, isLocked: true },
            }));

            this.procedureService.setStepValue(
                this.id(), this.revision()!, flatIndex, '', step.type, '', previousValue
            ).subscribe({
                next: () => {
                    // Server confirmed — now clear the completion value.
                    this.stepState.update(map => ({
                        ...map,
                        [flatIndex]: { recordedValue: '', stepInfo: '', isPending: false, isLocked: false },
                    }));
                    this.autoCompleteParents();
                },
                error: (err) => {
                    // Nothing to revert — just clear the pending state.
                    this.stepState.update(map => ({
                        ...map,
                        [flatIndex]: { ...map[flatIndex], isPending: false, isLocked: false },
                    }));
                    if (err?.status === 409) {
                        this.rejectedSteps.update(prev => { const s = new Set(prev); s.add(flatIndex); return s; });
                        setTimeout(() => {
                            this.rejectedSteps.update(prev => { const s = new Set(prev); s.delete(flatIndex); return s; });
                        }, 100);
                        this.procedureService.requestRefresh();
                    }
                    this.handleError(err, 'Error', 'Failed to rewind step.');
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

        const user = this.authService.user();
        if (!user || !user.auth?.name) {
            alert('Your session appears to be invalid or expired. Please log in again to continue.');
            this.authService.logout();
            return;
        }

        const role = this.getUserCallsign() || '';
        const comment = this.closingComment();

        this.procedureService.completeInstance(id, revision, comment).subscribe({
            next: () => {
                this.procedureService.requestRefresh();
                this.router.navigate(['/dashboard/archived', id]);
            },
            error: (err) => {
                this.handleError(err, 'Error', 'An error occurred while trying to complete the procedure.');
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
        const mission = this.cachedEventName();
        if (!user?.missions || !mission) return null;
        const userMission = user.missions.find(m => m.name?.toLowerCase() === mission.toLowerCase());
        return userMission?.currentRole?.callsign || null;
    }

    private clearUserPresence(): void {
        const id = this.id();
        const revision = this.revision();
        if (!id || !revision || !this.isRunningInstance()) return;

        // Use sendBeacon for reliable delivery during page unload.
        // Wrap in a Blob with application/json so Express body-parser picks it up!
        const payload = { pid: id, revision: parseInt(revision, 10), isOnline: false };
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon('/api/procedures/instances/user-status', blob);
    }

    /**
     * Walks the immutable shape tree to find parent heading steps that should be
     * automatically completed or un-completed based on their children's entity state.
     * Applies all changes atomically to stepState in a single signal write.
     */
    private autoCompleteParents(): void {
        const shapes = this.stepShapes();
        const currentState = this.stepState();

        const toComplete: { index: number; parent: any; previousInfo: string }[] = [];
        const toUncomplete: { index: number; parent: any; prevValue: string; previousInfo: string }[] = [];

        const now = new Date();
        const utcClock = `${this.getDayOfYear(now)}.${
            String(now.getUTCHours()).padStart(2, '0')}:${
            String(now.getUTCMinutes()).padStart(2, '0')}:${
            String(now.getUTCSeconds()).padStart(2, '0')} UTC`;

        const markParents = (list: ProcedureStep[]): void => {
            for (const step of list) {
                if (step.children && step.children.length > 0) {
                    markParents(step.children);
                    const allDone = step.children.every(c => {
                        const s = currentState[c.flatIndex];
                        return s?.recordedValue && s.recordedValue.trim().length > 0;
                    });
                    const parentState = currentState[step.flatIndex];
                    const isCurrentlyDone = !!(parentState?.recordedValue && parentState.recordedValue.trim().length > 0);

                    if (allDone && !isCurrentlyDone) {
                        const prevInfo = parentState?.recordedValue || '';
                        toComplete.push({
                            index: step.flatIndex,
                            parent: { contenttype: step.type === 'command' ? 'Command' : 'HEADING' },
                            previousInfo: prevInfo,
                        });
                    } else if (!allDone && isCurrentlyDone) {
                        const prevValue = parentState?.recordedValue || '';
                        toUncomplete.push({
                            index: step.flatIndex,
                            parent: { contenttype: step.type === 'command' ? 'Command' : 'HEADING' },
                            prevValue,
                            previousInfo: prevValue,
                        });
                    }
                }
            }
        };
        markParents(shapes);

        if (toComplete.length === 0 && toUncomplete.length === 0) return;

        // Pessimistic: mark parents as pending without changing their value yet.
        this.stepState.update(map => {
            const next = { ...map };
            for (const p of toComplete) {
                next[p.index] = { ...next[p.index], isPending: true, isLocked: true };
            }
            for (const p of toUncomplete) {
                next[p.index] = { ...next[p.index], isPending: true, isLocked: true };
            }
            return next;
        });

        const id = this.id();
        const revision = this.revision();
        const user = this.authService.user();
        if (!id || !revision || !user || !this.isRunningInstance()) return;

        if (toComplete.length > 0) {
            this.procedureService.setParentsInfo(id, revision, toComplete, utcClock).subscribe({
                next: () => {
                    // Server confirmed — now apply the completion timestamps.
                    this.stepState.update(map => {
                        const next = { ...map };
                        for (const p of toComplete) {
                            next[p.index] = { ...next[p.index], recordedValue: utcClock, isPending: false, isLocked: false };
                        }
                        return next;
                    });
                },
                error: (err) => {
                    this.handleError(err, 'Error', 'Failed to save parent completions.');
                    // Nothing to revert — just release pending.
                    this.stepState.update(map => {
                        const next = { ...map };
                        for (const p of toComplete) {
                            next[p.index] = { ...next[p.index], isPending: false, isLocked: false };
                        }
                        return next;
                    });
                },
            });
        }

        if (toUncomplete.length > 0) {
            this.procedureService.setParentsInfo(id, revision, toUncomplete, '').subscribe({
                next: () => {
                    // Server confirmed — now clear the parent values.
                    this.stepState.update(map => {
                        const next = { ...map };
                        for (const p of toUncomplete) {
                            next[p.index] = { ...next[p.index], recordedValue: '', isPending: false, isLocked: false };
                        }
                        return next;
                    });
                },
                error: (err) => {
                    this.handleError(err, 'Error', 'Failed to save parent rewinds.');
                    // Nothing to revert — just release pending.
                    this.stepState.update(map => {
                        const next = { ...map };
                        for (const p of toUncomplete) {
                            next[p.index] = { ...next[p.index], isPending: false, isLocked: false };
                        }
                        return next;
                    });
                },
            });
        }
    }

    // ── Entity helpers ────────────────────────────────────────────────────

    /**
     * Builds the initial entity map from a step tree loaded from the server.
     * Walks all nodes recursively to capture every step's flatIndex.
     */
    private buildEntityMap(steps: ProcedureStep[]): StepEntityMap {
        const map: StepEntityMap = {};
        const walk = (list: ProcedureStep[]): void => {
            for (const step of list) {
                map[step.flatIndex] = {
                    recordedValue: step.recordedValue ?? '',
                    stepInfo: step.stepInfo ?? '',
                    isPending: false,
                    isLocked: false,
                };
                if (step.children?.length) walk(step.children);
            }
        };
        walk(steps);
        return map;
    }

    /**
     * Pure function: merges the immutable shape tree with the mutable entity state
     * to produce the ProcedureStep[] the template renders. No mutations, no side-effects.
     */
    private mergeStepsWithState(shapes: ProcedureStep[], state: StepEntityMap): ProcedureStep[] {
        const merge = (list: ProcedureStep[]): ProcedureStep[] =>
            list.map(step => {
                const s = state[step.flatIndex];
                return {
                    ...step,
                    recordedValue: s?.recordedValue ?? step.recordedValue ?? '',
                    stepInfo: s?.stepInfo ?? step.stepInfo ?? '',
                    children: step.children?.length ? merge(step.children) : step.children,
                };
            });
        return merge(shapes);
    }

    /**
     * Compares the current entity map against a fresh server snapshot.
     * Skips locked entries (optimistic writes in-flight) and releases locks
     * once the server confirms our optimistic value.
     * Returns the updated map and a set of changed flatIndices for UI animations.
     * Uses copy-on-write — if nothing changed, returns the same map reference.
     */
    private syncEntityMap(
        current: StepEntityMap,
        serverSteps: ProcedureStep[]
    ): { map: StepEntityMap; changed: Set<number> } {
        let map = current; // start with same reference; only copy if needed
        const changed = new Set<number>();

        const walk = (list: ProcedureStep[]): void => {
            for (const step of list) {
                if (step.children?.length) walk(step.children);
                const existing = current[step.flatIndex];
                if (!existing) continue;

                if (existing.isLocked) {
                    // Release lock once the server echoes back our optimistic value
                    if ((step.recordedValue ?? '') === existing.recordedValue) {
                        if (map === current) map = { ...current };
                        map[step.flatIndex] = { ...existing, isLocked: false };
                    }
                    continue;
                }

                const serverValue = step.recordedValue ?? '';
                const serverInfo = step.stepInfo ?? '';
                if (existing.recordedValue !== serverValue || existing.stepInfo !== serverInfo) {
                    if (map === current) map = { ...current };
                    map[step.flatIndex] = { ...existing, recordedValue: serverValue, stepInfo: serverInfo };
                    changed.add(step.flatIndex);
                }
            }
        };
        walk(serverSteps);
        return { map, changed };
    }

    private getDayOfYear(date: Date): string {
        const start = Date.UTC(date.getUTCFullYear(), 0, 0);
        const day = Math.floor((date.getTime() - start) / (1000 * 60 * 60 * 24));
        if (day < 10) return '00' + day;
        if (day < 100) return '0' + day;
        return String(day);
    }
}
