import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { UserService } from '../../../../core/services/user.service';
import { UserAdmin, Role } from '../../../../core/models/user.model';
import { AuthService } from '../../../../core/services/auth.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

type TabId = 'roles' | 'missions';

@Component({
    selector: 'app-user-administration-dialog',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, FormsModule],
    templateUrl: './user-administration-dialog.html',
    styleUrls: ['./user-administration-dialog.scss']
})
export class UserAdministrationDialogComponent {
    /** Emitted when the dialog should be closed */
    close = output<void>();

    private userService = inject(UserService);
    private auth = inject(AuthService);

    private readonly LEAD_ROLE_CALLSIGNS = ['FLIGHT', 'MD', 'TD'];

    /** All missions for which the current user holds a lead role */
    private get leadMissions(): string[] {
        const user = this.auth.user();
        return (user?.missions ?? [])
            .filter(m => m.name && m.currentRole?.callsign &&
                this.LEAD_ROLE_CALLSIGNS.includes(m.currentRole.callsign.toUpperCase()))
            .map(m => m.name as string);
    }

    /** First lead mission — used as the authorization token for admin API calls */
    private get authMission(): string {
        const lead = this.leadMissions[0];
        if (lead) return lead;
        // Fallback to first available mission to prevent empty-string API params
        const user = this.auth.user();
        return user?.missions?.[0]?.name ?? '';
    }

    /** Active tab */
    activeTab = signal<TabId>('roles');

    // ── Roles tab state ──
    users = signal<UserAdmin[]>([]);
    availableRoles = signal<Role[]>([]);

    loading = signal<boolean>(true);
    error = signal<string | null>(null);
    saving = signal<boolean>(false);

    selectedUserControl = new FormControl<UserAdmin | null>(null);
    selectedRolesMap = signal<Map<string, Role>>(new Map());

    // ── Missions tab state ──
    allUsers = signal<UserAdmin[]>([]);
    allMissions = signal<string[]>([]);
    missionsLoading = signal<boolean>(false);
    missionsError = signal<string | null>(null);
    missionsSaving = signal<boolean>(false);

    selectedMissionUserControl = new FormControl<UserAdmin | null>(null);
    userMissions = signal<string[]>([]);
    newMission = signal<string>('');

    constructor() {
        // When a new user is selected in the dropdown, map their allowedRoles to the checks
        this.selectedUserControl.valueChanges
            .pipe(takeUntilDestroyed())
            .subscribe(user => {
                const newMap = new Map<string, Role>();
                if (user && user.allowedRoles) {
                    const rolesArray = this.parseAllowedRoles(user.allowedRoles);
                    rolesArray.forEach(r => newMap.set(r.callsign, r));
                }
                this.selectedRolesMap.set(newMap);
            });

        // When a user is selected in the missions tab, load their missions
        this.selectedMissionUserControl.valueChanges
            .pipe(takeUntilDestroyed())
            .subscribe(user => {
                if (user) {
                    this.loadUserMissions(user.auth.email);
                } else {
                    this.userMissions.set([]);
                }
            });

        // Kick off initial data load from the constructor instead of ngOnInit
        this.loadData();
    }

    private parseAllowedRoles(allowedRoles: Role[] | Record<string, number>): Role[] {
        if (Array.isArray(allowedRoles)) {
            return allowedRoles;
        }

        // If it's an object map like {'MD': 1, 'CC': 1}, rebuild it using the available roles
        const roles: Role[] = [];
        const configKeys = Object.keys(allowedRoles);

        configKeys.forEach(key => {
            const fullRole = this.availableRoles().find(r => r.callsign === key);
            if (fullRole) roles.push(fullRole);
        });
        return roles;
    }

    private loadData(): void {
        const missions = this.leadMissions;
        if (missions.length === 0) {
            this.error.set('You are not assigned as a lead for any mission.');
            this.loading.set(false);
            return;
        }

        this.loading.set(true);
        this.error.set(null);

        // Fetch role config AND all users for lead missions in parallel
        forkJoin({
            rolesConfig: this.userService.getRoles(),
            usersPerMission: forkJoin(missions.map(m => this.userService.getUsers(m)))
        }).subscribe({
            next: ({ rolesConfig, usersPerMission }: { rolesConfig: any; usersPerMission: (UserAdmin[] | null)[] }) => {
                // Parse roles
                const rawRoles = (rolesConfig as any)?.roles || {};
                const parsedRoles = Object.keys(rawRoles).map(k => ({
                    name: rawRoles[k].name,
                    callsign: rawRoles[k].callsign
                }));
                this.availableRoles.set(parsedRoles);

                // Merge users across all lead missions, keyed by email
                const merged = new Map<string, UserAdmin>();
                usersPerMission.forEach((users, idx) => {
                    (users || []).forEach(u => {
                        if (!merged.has(u.auth.email)) {
                            merged.set(u.auth.email, { ...u, mission: missions[idx] });
                        }
                    });
                });
                this.users.set(Array.from(merged.values()));
                this.loading.set(false);
            },
            error: (err: any) => {
                console.error('Failed to load admin data', err);
                this.error.set('Failed to load roles or users. Please try again.');
                this.loading.set(false);
            }
        });
    }

    onBackdropClick(event: MouseEvent): void {
        if ((event.target as HTMLElement).classList.contains('dialog-overlay')) {
            this.close.emit();
        }
    }

    isRoleChecked(callsign: string): boolean {
        return this.selectedRolesMap().has(callsign);
    }

    toggleRole(callsign: string, event: Event): void {
        const checked = (event.target as HTMLInputElement).checked;
        const role = this.availableRoles().find(r => r.callsign === callsign);

        if (!role) return;

        const updatedMap = new Map(this.selectedRolesMap());
        if (checked) {
            updatedMap.set(callsign, role);
        } else {
            updatedMap.delete(callsign);
        }

        this.selectedRolesMap.set(updatedMap);
    }

    saveRoles(): void {
        const user = this.selectedUserControl.value;
        if (!user || this.saving()) return;

        this.saving.set(true);
        // Extract array of Roles from Map
        const roleArray = Array.from(this.selectedRolesMap().values());

        // Use the mission the user record was loaded from; fall back to first lead mission
        const missionForSave = (user as UserAdmin).mission ?? this.authMission;
        this.userService.setAllowedRoles(user.auth.email, roleArray, missionForSave).subscribe({
            next: () => {
                this.saving.set(false);
                this.close.emit();
            },
            error: (err: any) => {
                console.error('Failed to set allowed roles', err);
                alert('An error occurred while saving the user roles.');
                this.saving.set(false);
            }
        });
    }

    // ── Tab switching ──

    switchTab(tab: TabId): void {
        this.activeTab.set(tab);
        if (tab === 'missions' && this.allMissions().length === 0) {
            this.loadMissionsData();
        }
    }

    // ── Missions tab methods ──

    private loadMissionsData(): void {
        const auth = this.authMission;
        if (!auth) {
            this.missionsError.set('You are not assigned as a lead for any mission.');
            return;
        }

        this.missionsLoading.set(true);
        this.missionsError.set(null);

        this.userService.getMissions(auth).subscribe({
            next: (missions: string[]) => {
                this.allMissions.set(missions);

                // Re-use already-loaded users if available (loadData already merged all missions)
                if (this.users().length > 0) {
                    this.allUsers.set(this.users());
                    this.missionsLoading.set(false);
                } else {
                    const leadMs = this.leadMissions;
                    forkJoin(leadMs.map(m => this.userService.getUsers(m))).subscribe({
                        next: (results: (UserAdmin[] | null)[]) => {
                            const merged = new Map<string, UserAdmin>();
                            results.forEach((users, idx) => {
                                (users || []).forEach(u => {
                                    if (!merged.has(u.auth.email)) {
                                        merged.set(u.auth.email, { ...u, mission: leadMs[idx] });
                                    }
                                });
                            });
                            this.allUsers.set(Array.from(merged.values()));
                            this.missionsLoading.set(false);
                        },
                        error: () => {
                            this.missionsError.set('Failed to load users.');
                            this.missionsLoading.set(false);
                        }
                    });
                }
            },
            error: () => {
                this.missionsError.set('Failed to load missions list.');
                this.missionsLoading.set(false);
            }
        });
    }

    private loadUserMissions(email: string): void {
        this.userService.getUserMissions(email, this.authMission).subscribe({
            next: (missions: string[]) => this.userMissions.set(missions),
            error: () => this.userMissions.set([])
        });
    }

    addMission(): void {
        const user = this.selectedMissionUserControl.value;
        const mission = this.newMission().trim();
        if (!user || !mission || this.missionsSaving()) return;

        this.missionsSaving.set(true);
        this.userService.addMissionToUser(user.auth.email, mission).subscribe({
            next: () => {
                this.missionsSaving.set(false);
                this.newMission.set('');
                this.loadUserMissions(user.auth.email);
                // Refresh available missions list
                this.userService.getMissions(this.authMission).subscribe({
                    next: (m: string[]) => this.allMissions.set(m)
                });
            },
            error: (err: any) => {
                console.error('Failed to add mission', err);
                alert('An error occurred while adding the mission.');
                this.missionsSaving.set(false);
            }
        });
    }

    removeMission(missionName: string): void {
        const user = this.selectedMissionUserControl.value;
        if (!user || this.missionsSaving()) return;

        this.missionsSaving.set(true);
        this.userService.removeMissionFromUser(user.auth.email, missionName).subscribe({
            next: (result: any) => {
                this.missionsSaving.set(false);
                this.userMissions.set(result.missions || []);
            },
            error: (err: any) => {
                console.error('Failed to remove mission', err);
                alert('An error occurred while removing the mission.');
                this.missionsSaving.set(false);
            }
        });
    }

    isMissionAssigned(name: string): boolean {
        return this.userMissions().includes(name);
    }

    toggleMission(missionName: string): void {
        const user = this.selectedMissionUserControl.value;
        if (!user || this.missionsSaving()) return;

        if (this.isMissionAssigned(missionName)) {
            this.removeMission(missionName);
        } else {
            this.missionsSaving.set(true);
            this.userService.addMissionToUser(user.auth.email, missionName).subscribe({
                next: () => {
                    this.missionsSaving.set(false);
                    this.loadUserMissions(user.auth.email);
                },
                error: (err: any) => {
                    console.error('Failed to add mission', err);
                    alert('An error occurred while adding the mission.');
                    this.missionsSaving.set(false);
                }
            });
        }
    }
}
