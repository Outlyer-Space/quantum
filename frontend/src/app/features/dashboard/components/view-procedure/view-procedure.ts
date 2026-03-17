import { ChangeDetectionStrategy, Component, signal, OnInit, OnDestroy, computed, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { Subject, timer, merge } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { NavbarService } from '../../services/navbar.service';
import { ProcedureService } from '../../../../core/services/procedure.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ProcedureStep } from '../../../../core/models/procedure.model';

@Component({
    selector: 'app-view-procedure',
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './view-procedure.html',
    styleUrl: './view-procedure.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ViewProcedureComponent implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();

    protected procedureId = signal<string>('');
    protected procedureVersion = signal<string | null>(null);
    protected procedureRevision = signal<string | null>(null);
    protected procedureTitle = signal<string>('');

    protected isArchived = signal<boolean>(false);
    protected isRunningInstance = signal<boolean>(false);

    protected steps = signal<ProcedureStep[]>([]);

    /** The mission (eventname) this procedure belongs to */
    private procedureMission = signal<string>('');

    private readonly LEAD_ROLES = ['FLIGHT', 'MD', 'TD'];

    /* Dynamic FormGroup: keys are step IDs, values are FormControls for input steps */
    protected inputForm = new FormGroup<Record<string, FormControl<string>>>({});

    /** Track which control currently has user focus so polling doesn't nuke typing */
    private focusedControlId: string | null = null;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private location: Location,
        private nav: NavbarService,
        private procedureService: ProcedureService,
        private authService: AuthService
    ) {
        this.nav.showReturnBtn.set(true);
    }

    protected flattenedSteps = computed(() => {
        const result: ProcedureStep[] = [];
        const flatten = (steps: ProcedureStep[]) => {
            for (const step of steps) {
                result.push(step);
                if (step.isOpen && step.children) {
                    flatten(step.children);
                }
            }
        };
        flatten(this.steps());
        return result;
    });

    /** Determines if all actionable leaf nodes (either input or checkboxes) have a recorded value */
    protected allActionableStepsCompleted = computed(() => {
        const steps = this.flattenedSteps();
        const actionableSteps = steps.filter(s => !s.children || s.children.length === 0);

        if (actionableSteps.length === 0) return false;
        return actionableSteps.every(s => s.recordedValue && s.recordedValue.trim().length > 0);
    });

    /**
     * Returns all leaf (actionable) steps from the full tree, sorted by flatIndex.
     * Ignores isOpen so collapsed sections are still counted.
     */
    private getAllActionableSteps(): ProcedureStep[] {
        const result: ProcedureStep[] = [];
        const walk = (steps: ProcedureStep[]) => {
            for (const step of steps) {
                if (!step.children || step.children.length === 0) {
                    result.push(step);
                } else {
                    walk(step.children);
                }
            }
        };
        walk(this.steps());
        return result.sort((a, b) => a.flatIndex - b.flatIndex);
    }

    /**
     * A step can be edited when:
     *  - The user's callsign matches the step's role (or user is a lead role).
     *  - Checking (no recordedValue): all previous actionable steps must be completed first.
     *  - Unchecking / rewind (has recordedValue): no later actionable step may have a value.
     * Both checkbox and input recordedValues count as "completed".
     */
    protected canEditStep(step: ProcedureStep): boolean {
        // Role gate: user must have the right callsign for this step
        const callsign = this.getUserCallsign();
        if (callsign &&
            !this.LEAD_ROLES.includes(callsign.toUpperCase()) &&
            !step.role.toUpperCase().includes(callsign.toUpperCase())) {
            return false;
        }

        const all = this.getAllActionableSteps();
        const idx = all.findIndex(s => s.flatIndex === step.flatIndex);
        if (idx === -1) return false;

        if (!step.recordedValue || step.recordedValue.trim().length === 0) {
            // Checking / setting value: every previous step must already have a value
            const priorSteps = all.slice(0, idx);
            return priorSteps.every(s => s.recordedValue && s.recordedValue.trim().length > 0);
        }

        // Unchecking / rewind: no later step may have a value
        if (idx === all.length - 1) return true;
        const laterSteps = all.slice(idx + 1);
        return !laterSteps.some(s => s.recordedValue && s.recordedValue.trim().length > 0);
    }

    /** Resolve the current user's callsign for this procedure's mission */
    private getUserCallsign(): string | null {
        const user = this.authService.user();
        const mission = this.procedureMission();
        if (!user?.missions || !mission) return null;
        const userMission = user.missions.find(
            m => m.name?.toLowerCase() === mission.toLowerCase()
        );
        return userMission?.currentRole?.callsign || null;
    }

    ngOnInit(): void {
        const url = this.router.url;

        // Determine view state
        if (url.includes('archivedinstance')) {
            this.isArchived.set(true);
            this.isRunningInstance.set(false);
            this.nav.isArchived.set(true);
        } else if (url.includes('runninginstance')) {
            this.isArchived.set(false);
            this.isRunningInstance.set(true);
            this.nav.isArchived.set(false);
        } else if (url.includes('run')) {
            this.isArchived.set(false);
            this.isRunningInstance.set(false);
            this.nav.isArchived.set(false);
        }

        this.route.paramMap.pipe(
            takeUntil(this.destroy$)
        ).subscribe(params => {
            const id = params.get('id');
            const version = params.get('version');
            const revision = params.get('revision');

            if (version) this.procedureVersion.set(version);
            if (revision) this.procedureRevision.set(revision);

            if (id) {
                this.procedureId.set(id);

                if (this.isRunningInstance()) {
                    // --- LIVE POLLING for running instances ---
                    merge(
                        timer(0, 5000),
                        this.procedureService.refresh$
                    ).pipe(
                        switchMap(() => this.procedureService.getLiveInstanceData(id, revision!)),
                        takeUntil(this.destroy$)
                    ).subscribe({
                        next: (data) => {
                            if (data.eventname) this.procedureMission.set(data.eventname);
                            this.mergeIncomingData(data.title, data.steps);
                        },
                        error: (err) => console.error('Failed to load procedure data:', err)
                    });
                } else if (this.isArchived()) {
                    // --- SINGLE FETCH for archived instances ---
                    this.procedureService.getLiveInstanceData(id, revision!).subscribe({
                        next: (data) => {
                            if (data.eventname) this.procedureMission.set(data.eventname);
                            this.procedureTitle.set(data.title);
                            this.steps.set(data.steps);
                            this.buildInputForm(data.steps);
                            this.updateNavTitle();
                        },
                        error: (err) => console.error('Failed to load procedure data:', err)
                    });
                } else {
                    // --- SINGLE FETCH for preview ---
                    this.procedureService.getProcedureData(id).subscribe({
                        next: (data) => {
                            if (data.eventname) this.procedureMission.set(data.eventname);
                            this.procedureTitle.set(data.title);
                            this.steps.set(data.steps);
                            this.buildInputForm(data.steps);
                            this.updateNavTitle();
                        },
                        error: (err) => console.error('Failed to load procedure data:', err)
                    });
                }
            }

            this.updateNavTitle();
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * Intelligently merge polled data without destroying active user input.
     * Updates title and steps signal, and patches only non-focused FormControls.
     */
    private mergeIncomingData(title: string, newSteps: ProcedureStep[]): void {
        const isFirstLoad = this.steps().length === 0;

        this.procedureTitle.set(title);
        this.steps.set(newSteps);
        this.updateNavTitle();

        if (isFirstLoad) {
            // First load: build the entire form from scratch
            this.buildInputForm(newSteps);
        } else {
            // Subsequent polls: patch FormControl values, skipping the focused one
            this.patchInputForm(newSteps);
        }
    }

    /**
     * Walk the new steps and update existing FormControl values
     * ONLY if that control is not currently focused by the user.
     */
    private patchInputForm(steps: ProcedureStep[]): void {
        const walk = (list: ProcedureStep[]) => {
            for (const step of list) {
                if (step.type === 'input') {
                    const ctrl = this.inputForm.controls[step.id];
                    if (ctrl && step.id !== this.focusedControlId) {
                        ctrl.setValue(step.inputValue ?? '', { emitEvent: false });
                    }
                }
                if (step.children) walk(step.children);
            }
        };
        walk(steps);
    }

    /* Recursively create FormControls for every 'input' type step */
    private buildInputForm(steps: ProcedureStep[]): void {
        const controls: Record<string, FormControl<string>> = {};
        const walk = (list: ProcedureStep[]) => {
            for (const step of list) {
                if (step.type === 'input') {
                    controls[step.id] = new FormControl(step.inputValue ?? '', { nonNullable: true });
                }
                if (step.children) walk(step.children);
            }
        };
        walk(steps);
        this.inputForm = new FormGroup(controls);

        // Disable all controls if archived
        if (this.isArchived()) {
            Object.values(this.inputForm.controls).forEach(c => c.disable());
        }
    }

    /*  Get the FormControl for a specific step id */
    protected getControl(stepId: string): FormControl<string> {
        return this.inputForm.controls[stepId] as FormControl<string>;
    }

    /** Called from template (focus)="onControlFocus(step.id)" */
    protected onControlFocus(stepId: string): void {
        this.focusedControlId = stepId;
    }

    /** Called from template (blur)="onControlBlur()" */
    protected onControlBlur(): void {
        this.focusedControlId = null;
    }

    private updateNavTitle(): void {
        if (this.isArchived()) {
            this.nav.title.set(`AS-Run Archive ${this.procedureId()} - ${this.procedureTitle()}`);
        } else if (this.isRunningInstance()) {
            this.nav.title.set(`Open Procedure ${this.procedureId()} - ${this.procedureTitle()}`);
        } else {
            this.nav.title.set(`Running: ${this.procedureId()} - ${this.procedureTitle()}`);
        }
    }

    protected toggleStep(step: ProcedureStep): void {
        if (step.children && step.children.length > 0) {
            step.isOpen = !step.isOpen;
            this.steps.set([...this.steps()]);
        }
    }

    protected clearInputValue(step: ProcedureStep): void {
        if (this.isArchived()) return;
        if (!this.canEditStep(step)) return;
        if (!step.recordedValue) return;

        const previous = step.recordedValue;
        step.recordedValue = '';
        this.steps.set([...this.steps()]);

        const user = this.authService.user();
        const username = user?.auth?.name || 'Unknown User';

        this.procedureService.setStepValue(
            this.procedureId(),
            this.procedureRevision()!,
            step.flatIndex,
            '',
            step.type,
            username,
            ''
        ).subscribe({
            next: () => this.procedureService.requestRefresh(),
            error: (err) => {
                console.error('Failed to clear input value:', err);
                step.recordedValue = previous;
                this.steps.set([...this.steps()]);
            }
        });
        this.autoCompleteParents();
    }

    protected setInputValue(step: ProcedureStep): void {
        if (this.isArchived()) return;
        if (!this.canEditStep(step)) return;

        const ctrl = this.getControl(step.id);
        if (!ctrl) return;

        const val = ctrl.value;
        if (!val || val.trim().length === 0) return;

        const previous = step.recordedValue;
        step.recordedValue = val;
        ctrl.reset('');
        this.steps.set([...this.steps()]);

        const user = this.authService.user();
        const username = user?.auth?.name || 'Unknown User';

        this.procedureService.setStepValue(
            this.procedureId(),
            this.procedureRevision()!,
            step.flatIndex,
            val,
            step.type,
            username
        ).subscribe({
            next: () => this.procedureService.requestRefresh(),
            error: (err) => {
                console.error('Failed to save step value:', err);
                step.recordedValue = previous;
                this.steps.set([...this.steps()]);
            }
        });
        this.autoCompleteParents();
    }

    protected goBack(): void {
        this.location.back();
    }

    protected toggleStepCompletion(step: ProcedureStep, event: Event): void {
        if (!this.canEditStep(step)) {
            // Prevent the browser toggling the checkbox when locked
            (event.target as HTMLInputElement).checked = !!step.recordedValue;
            return;
        }

        const checkbox = event.target as HTMLInputElement;
        const user = this.authService.user();
        const username = user?.auth?.name || 'Unknown User';

        if (checkbox.checked) {
            // Format timestamp as DDD.HH:MM:SS UTC (mission-control standard)
            const now = new Date();
            const year = now.getUTCFullYear();
            const dayOfYear = this.getDayOfYear(now);
            const h = String(now.getUTCHours()).padStart(2, '0');
            const m = String(now.getUTCMinutes()).padStart(2, '0');
            const s = String(now.getUTCSeconds()).padStart(2, '0');
            const utcClock = `${dayOfYear}.${h}:${m}:${s} UTC`;
            const timestamp = `${year} - ${utcClock} ${username}`;

            // Optimistic update
            const previous = step.recordedValue;
            step.recordedValue = timestamp;
            this.steps.set([...this.steps()]);
            this.autoCompleteParents();

            this.procedureService.setStepValue(
                this.procedureId(),
                this.procedureRevision()!,
                step.flatIndex,
                '', // no actual string value for checkboxes
                step.type,
                username,
                timestamp
            ).subscribe({
                next: () => this.procedureService.requestRefresh(),
                error: (err) => {
                    console.error('Failed to save step completion:', err);
                    step.recordedValue = previous;
                    this.steps.set([...this.steps()]);
                    checkbox.checked = false;
                }
            });
        } else {
            // Rewind: clear the recorded value
            const previous = step.recordedValue;
            step.recordedValue = '';
            this.steps.set([...this.steps()]);
            this.autoCompleteParents();

            this.procedureService.setStepValue(
                this.procedureId(),
                this.procedureRevision()!,
                step.flatIndex,
                '', // empty clears the value on backend
                step.type,
                username,
                '' // clear info too
            ).subscribe({
                next: () => this.procedureService.requestRefresh(),
                error: (err) => {
                    console.error('Failed to rewind step:', err);
                    step.recordedValue = previous;
                    this.steps.set([...this.steps()]);
                    checkbox.checked = true;
                }
            });
        }
    }

    protected completeProcedure(): void {
        const id = this.procedureId();
        const revision = this.procedureRevision();

        if (!id || !revision) return;

        const confirmArchive = window.confirm('Are you sure you want to complete and archive this procedure?');
        if (!confirmArchive) return;

        const user = this.authService.user();
        const username = user?.auth?.name || 'Unknown User';

        this.procedureService.completeInstance(id, revision, username).subscribe({
            next: () => {
                this.procedureService.requestRefresh();
                this.router.navigate(['/dashboard/archived', id]);
            },
            error: (err) => {
                console.error('Failed to complete procedure:', err);
                alert('An error occurred while trying to complete the procedure.');
            }
        });
    }

    /** Zero-padded day-of-year (001–366) */
    private getDayOfYear(date: Date): string {
        const start = Date.UTC(date.getUTCFullYear(), 0, 0);
        const diff = date.getTime() - start;
        const day = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (day < 10) return '00' + day;
        if (day < 100) return '0' + day;
        return String(day);
    }

    /**
     * Walk up the tree and auto-mark parent steps as completed
     * when ALL their direct children have a recordedValue.
     */
    private autoCompleteParents(): void {
        const markParents = (steps: ProcedureStep[]): void => {
            for (const step of steps) {
                if (step.children && step.children.length > 0) {
                    // Recurse first — bottom-up
                    markParents(step.children);
                    const allDone = step.children.every(
                        c => c.recordedValue && c.recordedValue.trim().length > 0
                    );
                    if (allDone && !step.recordedValue) {
                        const now = new Date();
                        const utcClock = `${this.getDayOfYear(now)}.${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')} UTC`;
                        step.recordedValue = utcClock;
                    } else if (!allDone && step.recordedValue) {
                        // Rewind parent if a child was cleared
                        step.recordedValue = '';
                    }
                }
            }
        };
        markParents(this.steps());
        this.steps.set([...this.steps()]);
    }
}
