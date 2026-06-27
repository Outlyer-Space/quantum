import { ChangeDetectionStrategy, Component, inject, signal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { Role } from '../../models/role';
import { UserService } from '../../../../core/services/user.service';
import { AuthService } from '../../../../core/services/auth.service';
import { NavbarService } from '../../services/navbar.service';

@Component({
    selector: 'app-settings-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    templateUrl: './settings-dialog.html',
    styleUrl: './settings-dialog.scss',
})
export class SettingsDialogComponent {
    private userService = inject(UserService);
    private auth = inject(AuthService);
    private nav = inject(NavbarService);

    /** All available missions and their roles */
    protected allMissions = signal<{ name: string; allowedRoles: Role[] }[]>([]);

    /** The currently selected value (mission::role) */
    protected selectedRoleValue = signal('');
    protected selectedMission = signal('');
    protected selectedRole = signal<Role | null>(null);

    /** Whether the dialog is visible — controlled by parent */
    isOpen = signal(false);

    /** Emitted after a successful save */
    roleChanged = output<void>();

    loading = signal(false);

    open(): void {
        this.isOpen.set(true);
        this.loadUserRoles();
    }

    private loadUserRoles(): void {
        const user = this.auth.user();
        if (!user || !user.auth?.email || !user.missions) return;

        this.loading.set(true);
        const requests = user.missions.map(m => {
            const missionName = m.name || '';
            return forkJoin({
                mission: of(missionName),
                allowed: this.userService.getAllowedRoles(user.auth.email, missionName),
                current: this.userService.getCurrentRole(user.auth.email, missionName)
            });
        });

        if (requests.length === 0) {
            this.loading.set(false);
            return;
        }

        forkJoin(requests).subscribe({
            next: (results) => {
                const missions = results.map(res => {
                    const rolesArray = Array.isArray(res.allowed)
                        ? res.allowed
                        : Object.keys(res.allowed).map((k: string) => res.allowed[k]);
                    return {
                        name: res.mission,
                        allowedRoles: rolesArray as Role[]
                    };
                });
                this.allMissions.set(missions);
                
                // Pre-select the global active mission
                const activeMission = this.auth.globalActiveMission();
                const currentRes = results.find(r => r.mission === activeMission);
                if (currentRes && currentRes.current) {
                    this.selectedRoleValue.set(`${activeMission}::${currentRes.current.name}`);
                    this.selectedMission.set(activeMission);
                    this.selectedRole.set(currentRes.current);
                } else if (results.length > 0 && results[0].current) {
                    this.selectedRoleValue.set(`${results[0].mission}::${results[0].current.name}`);
                    this.selectedMission.set(results[0].mission);
                    this.selectedRole.set(results[0].current);
                }
                this.loading.set(false);
            },
            error: (err) => {
                console.error('Failed to load role settings', err);
                this.loading.set(false);
            }
        });
    }

    close(): void {
        this.isOpen.set(false);
    }

    protected save(): void {
        const user = this.auth.user();
        const mission = this.selectedMission();
        const role = this.selectedRole();

        if (role && user?.auth?.email && mission) {
            this.loading.set(true);
            this.userService.setUserRole(user.auth.email, role, mission).subscribe({
                next: () => {
                    this.auth.globalActiveMission.set(mission);
                    localStorage.setItem('globalActiveMission', mission);
                    
                    // Re-fetch the session to update signals in navbar
                    this.auth.initSession().subscribe({
                        next: () => {
                            this.loading.set(false);
                            this.roleChanged.emit();
                            this.close();
                        },
                        error: () => {
                            this.loading.set(false);
                            this.close();
                        }
                    });
                },
                error: (err) => {
                    console.error('Failed to set role', err);
                    this.loading.set(false);
                }
            });
        } else {
            this.close();
        }
    }

    protected onRoleChange(missionName: string, role: Role): void {
        this.selectedRoleValue.set(`${missionName}::${role.name}`);
        this.selectedMission.set(missionName);
        this.selectedRole.set(role);
    }

    /** Helper: pair roles into rows of 2 for the grid layout */
    protected getRolePairs(roles: Role[]): Role[][] {
        const pairs: Role[][] = [];
        if (!roles) return pairs;
        for (let i = 0; i < roles.length; i += 2) {
            pairs.push(roles.slice(i, i + 2));
        }
        return pairs;
    }
}
