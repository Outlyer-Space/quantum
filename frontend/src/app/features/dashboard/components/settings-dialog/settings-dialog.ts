import { ChangeDetectionStrategy, Component, inject, signal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
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

    /**
     * The mission to use for role API calls.
     * Prefers the procedure's mission when inside a procedure view;
     * falls back to missions[0] on the main dashboard.
     */
    private get mission(): string {
        const user = this.auth.user();
        if (!user?.missions?.length) return '';

        const activeMission = this.nav.activeMission();
        if (activeMission) {
            const found = user.missions.find(m => m.name?.toLowerCase() === activeMission);
            if (found) return found.name ?? '';
        }
        return user.missions[0]?.name ?? '';
    }

    /** All available roles */
    protected roles = signal<Role[]>([]);

    /** The currently selected role name (bound to radio group) */
    protected selectedRoleName = signal('');

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
        if (!user || !user.auth?.email) return;

        const mission = this.mission;
        if (!mission) {
            console.warn('Settings dialog: user has no missions assigned, skipping role load');
            return;
        }

        this.loading.set(true);
        forkJoin({
            allowed: this.userService.getAllowedRoles(user.auth.email, mission),
            current:  this.userService.getCurrentRole(user.auth.email, mission)
        }).subscribe({
            next: ({ allowed, current }: { allowed: any; current: Role }) => {
                // Ensure it's an array — backend may send an object map
                const rolesArray = Array.isArray(allowed)
                    ? allowed
                    : Object.keys(allowed).map((k: string) => allowed[k]);
                this.roles.set(rolesArray);
                this.selectedRoleName.set(current?.name || '');
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
        const selected = this.roles().find(r => r.name === this.selectedRoleName());
        const user = this.auth.user();
        const mission = this.mission;

        if (selected && user?.auth?.email && mission) {
            this.loading.set(true);
            this.userService.setUserRole(user.auth.email, selected, mission).subscribe({
                next: () => {
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

    protected onRoleChange(roleName: string): void {
        this.selectedRoleName.set(roleName);
    }

    /** Helper: pair roles into rows of 2 for the grid layout */
    protected get rolePairs(): Role[][] {
        const all = this.roles();
        const pairs: Role[][] = [];
        for (let i = 0; i < all.length; i += 2) {
            pairs.push(all.slice(i, i + 2));
        }
        return pairs;
    }
}
