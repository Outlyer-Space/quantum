import {
    ChangeDetectionStrategy,
    Component,
    signal,
    OnInit,
    OnDestroy,
    computed,
    inject,
    HostListener,
} from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { Subject, timer, merge, of } from 'rxjs';
import { switchMap, takeUntil, catchError, map } from 'rxjs/operators';
import { NavbarService } from '../../services/navbar.service';
import { ProcedureService } from '../../../../core/services/procedure.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ActiveUser, ProcedureStep } from '../../../../core/models/procedure.model';
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
export class ViewProcedureComponent implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();

    protected procedureId = signal<string>('');
    protected procedureVersion = signal<string | null>(null);
    protected procedureRevision = signal<string | null>(null);
    protected procedureTitle = signal<string>('');
    protected isArchived = signal<boolean>(false);
    protected isRunningInstance = signal<boolean>(false);
    protected steps = signal<ProcedureStep[]>([]);
    private procedureMission = signal<string>('');

    private readonly LEAD_ROLES = ['FLIGHT', 'MD', 'TD'];
    private focusedControlId: string | null = null;

    protected inputForm = new FormGroup<Record<string, FormControl<string>>>({});

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

    // ── Computed for the table component ────────────────────────────────────

    protected flattenedSteps = computed(() => flattenSteps(this.steps()));

    protected allActionableStepsCompleted = computed(() => {
        const steps = flattenSteps(this.steps());
        const actionable = steps.filter(s => !s.children || s.children.length === 0);
        if (actionable.length === 0) return false;
        return actionable.every(s => s.recordedValue && s.recordedValue.trim().length > 0);
    });

    /**
     * Bound predicate passed to <app-procedure-step-table [canEdit]>.
     * Uses an arrow function so `this` is always the component instance.
     */
    protected canEditStep = (step: ProcedureStep): boolean => {
        const callsign = this.getUserCallsign();
        if (callsign &&
            !this.LEAD_ROLES.includes(callsign.toUpperCase()) &&
            !step.role.toUpperCase().includes(callsign.toUpperCase())) {
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

    // ── Lifecycle ────────────────────────────────────────────────────────────

    ngOnInit(): void {
        const url = this.router.url;
        if (url.includes('archivedinstance')) {
            this.isArchived.set(true);
            this.nav.isArchived.set(true);
            this.nav.sidebarViewState.set('archived');
        } else if (url.includes('runninginstance')) {
            this.isRunningInstance.set(true);
            this.nav.isArchived.set(false);
            this.nav.sidebarViewState.set('running');
        } else {
            this.nav.isArchived.set(false);
            this.nav.sidebarViewState.set('preview');
        }

        this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
            const id = params.get('id');
            const version = params.get('version');
            const revision = params.get('revision');

            if (version) this.procedureVersion.set(version);
            if (revision) this.procedureRevision.set(revision);

            if (!id) return;
            this.procedureId.set(id);
            this.nav.sidebarProcedureId.set(id);

            if (this.isRunningInstance()) {
                // Mark user present
                const user = this.authService.user();
                const username = user?.auth?.name || 'Unknown User';
                const email = user?.auth?.email || '';
                this.procedureService.setUserStatus(id, revision!, username, email, true)
                    .pipe(takeUntil(this.destroy$))
                    .subscribe({ error: (err) => console.warn('Could not set user presence:', err) });

                // Live polling
                merge(timer(0, 5000), this.procedureService.refresh$).pipe(
                    switchMap(() => this.procedureService.getLiveInstanceData(id, revision!)),
                    takeUntil(this.destroy$)
                ).subscribe({
                    next: (data) => {
                        if (data.eventname) this.procedureMission.set(data.eventname);
                        this.nav.procedureTitle.set(data.title);
                        this.mergeIncomingData(data.title, data.steps);
                    },
                    error: (err) => console.error('Failed to load procedure data:', err),
                });

                // Active users poll
                timer(0, 20000).pipe(
                    switchMap(() => this.procedureService.getActiveUsers(id, revision!)),
                    switchMap(users => {
                        const mission = this.procedureMission();
                        if (!mission || users.length === 0) return of(users);
                        return this.authService.getUsersRoleStatus(mission).pipe(
                            map(roleData => this.enrichUsersWithCallsigns(users, roleData)),
                            catchError(() => of(users))
                        );
                    }),
                    takeUntil(this.destroy$)
                ).subscribe(users => this.nav.sidebarActiveUsers.set(users));

            } else if (this.isArchived()) {
                this.procedureService.getLiveInstanceData(id, revision!).subscribe({
                    next: (data) => {
                        if (data.eventname) this.procedureMission.set(data.eventname);
                        this.procedureTitle.set(data.title);
                        this.nav.procedureTitle.set(data.title);
                        this.steps.set(data.steps);
                        this.buildForm(data.steps);
                        this.updateNavTitle();
                    },
                    error: (err) => console.error('Failed to load procedure data:', err),
                });
            } else {
                this.procedureService.getProcedureData(id).subscribe({
                    next: (data) => {
                        if (data.eventname) this.procedureMission.set(data.eventname);
                        this.procedureTitle.set(data.title);
                        this.nav.procedureTitle.set(data.title);
                        this.steps.set(data.steps);
                        this.buildForm(data.steps);
                        this.updateNavTitle();
                    },
                    error: (err) => console.error('Failed to load procedure data:', err),
                });
            }

            this.updateNavTitle();
        });
    }

    ngOnDestroy(): void {
        this.clearUserPresence();
        this.nav.sidebarViewState.set(null);
        this.nav.sidebarProcedureId.set(null);
        this.nav.sidebarActiveUsers.set([]);
        this.nav.procedureTitle.set('');
        this.destroy$.next();
        this.destroy$.complete();
    }

    @HostListener('window:beforeunload')
    onBeforeUnload(): void {
        this.clearUserPresence();
    }

    // ── Output handlers from ProcedureStepTableComponent ────────────────────

    protected onStepToggled(step: ProcedureStep): void {
        this.steps.set([...this.steps()]);
    }

    protected onInputSet(step: ProcedureStep): void {
        if (this.isArchived() || !this.canEditStep(step)) return;
        const ctrl = this.inputForm.controls[step.id] as FormControl<string>;
        if (!ctrl) return;
        const val = ctrl.value;
        if (!val || val.trim().length === 0) return;

        const previous = step.recordedValue;
        step.recordedValue = val;
        ctrl.reset('');
        this.steps.set([...this.steps()]);

        const username = this.authService.user()?.auth?.name || 'Unknown User';
        this.procedureService.setStepValue(
            this.procedureId(), this.procedureRevision()!, step.flatIndex, val, step.type, username
        ).subscribe({
            next: () => this.procedureService.requestRefresh(),
            error: (err) => {
                console.error('Failed to save step value:', err);
                step.recordedValue = previous;
                this.steps.set([...this.steps()]);
            },
        });
        this.autoCompleteParents();
    }

    protected onInputCleared(step: ProcedureStep): void {
        if (this.isArchived() || !this.canEditStep(step) || !step.recordedValue) return;
        const previous = step.recordedValue;
        step.recordedValue = '';
        this.steps.set([...this.steps()]);

        const username = this.authService.user()?.auth?.name || 'Unknown User';
        this.procedureService.setStepValue(
            this.procedureId(), this.procedureRevision()!, step.flatIndex, '', step.type, username, ''
        ).subscribe({
            next: () => this.procedureService.requestRefresh(),
            error: (err) => {
                console.error('Failed to clear input value:', err);
                step.recordedValue = previous;
                this.steps.set([...this.steps()]);
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
            this.steps.set([...this.steps()]);
            this.autoCompleteParents();

            this.procedureService.setStepValue(
                this.procedureId(), this.procedureRevision()!, step.flatIndex, '', step.type, username, timestamp
            ).subscribe({
                next: () => this.procedureService.requestRefresh(),
                error: (err) => {
                    console.error('Failed to save step completion:', err);
                    step.recordedValue = previous;
                    this.steps.set([...this.steps()]);
                    checkbox.checked = false;
                },
            });
        } else {
            const previous = step.recordedValue;
            step.recordedValue = '';
            this.steps.set([...this.steps()]);
            this.autoCompleteParents();

            this.procedureService.setStepValue(
                this.procedureId(), this.procedureRevision()!, step.flatIndex, '', step.type, username, ''
            ).subscribe({
                next: () => this.procedureService.requestRefresh(),
                error: (err) => {
                    console.error('Failed to rewind step:', err);
                    step.recordedValue = previous;
                    this.steps.set([...this.steps()]);
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
        const id = this.procedureId();
        const revision = this.procedureRevision();
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

    // ── Private helpers ──────────────────────────────────────────────────────

    private buildForm(steps: ProcedureStep[]): void {
        const controls = buildInputFormControls(steps);
        this.inputForm = new FormGroup(controls);
        if (this.isArchived()) {
            Object.values(this.inputForm.controls).forEach(c => c.disable());
        }
    }

    private mergeIncomingData(title: string, newSteps: ProcedureStep[]): void {
        const isFirstLoad = this.steps().length === 0;
        this.procedureTitle.set(title);
        this.steps.set(newSteps);
        this.updateNavTitle();
        if (isFirstLoad) {
            this.buildForm(newSteps);
        } else {
            patchInputForm(this.inputForm, newSteps, this.focusedControlId);
        }
    }

    private updateNavTitle(): void {
        const id = this.procedureId();
        const title = this.procedureTitle();
        if (this.isArchived()) {
            this.nav.title.set(`Archive: ${title} (${id})`);
        } else if (this.isRunningInstance()) {
            this.nav.title.set(`Running: ${title} (${id})`);
        } else {
            this.nav.title.set(`Preview: ${title}`);
        }
    }

    private getUserCallsign(): string | null {
        const user = this.authService.user();
        const mission = this.procedureMission();
        if (!user?.missions || !mission) return null;
        const userMission = user.missions.find(m => m.name?.toLowerCase() === mission.toLowerCase());
        return userMission?.currentRole?.callsign || null;
    }

    private enrichUsersWithCallsigns(
        users: ActiveUser[],
        roleData: Array<{ auth: { email: string; name: string }; missions: Array<{ currentRole: { callsign: string } }> }>
    ): ActiveUser[] {
        return users.map(user => {
            const entry = roleData.find(r => r.auth?.email === user.email);
            const callsign = entry?.missions?.[0]?.currentRole?.callsign;
            return callsign ? { ...user, callsign } : user;
        });
    }

    private clearUserPresence(): void {
        if (!this.isRunningInstance()) return;
        const user = this.authService.user();
        const username = user?.auth?.name || 'Unknown User';
        const email = user?.auth?.email || '';
        const id = this.procedureId();
        const revision = this.procedureRevision();
        if (id && revision) {
            this.procedureService.setUserStatus(id, revision, username, email, false).subscribe();
        }
    }

    private autoCompleteParents(): void {
        const markParents = (steps: ProcedureStep[]): void => {
            for (const step of steps) {
                if (step.children && step.children.length > 0) {
                    markParents(step.children);
                    const allDone = step.children.every(c => c.recordedValue && c.recordedValue.trim().length > 0);
                    if (allDone && !step.recordedValue) {
                        const now = new Date();
                        const utcClock = `${this.getDayOfYear(now)}.${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')} UTC`;
                        step.recordedValue = utcClock;
                    } else if (!allDone && step.recordedValue) {
                        step.recordedValue = '';
                    }
                }
            }
        };
        markParents(this.steps());
        this.steps.set([...this.steps()]);
    }

    private getDayOfYear(date: Date): string {
        const start = Date.UTC(date.getUTCFullYear(), 0, 0);
        const day = Math.floor((date.getTime() - start) / (1000 * 60 * 60 * 24));
        if (day < 10) return '00' + day;
        if (day < 100) return '0' + day;
        return String(day);
    }
}
