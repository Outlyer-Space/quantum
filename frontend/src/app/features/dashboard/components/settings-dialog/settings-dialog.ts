import { ChangeDetectionStrategy, Component, inject, signal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Role } from '../../models/role';
import { UserService } from '../../../../core/services/user.service';
import { AuthService } from '../../../../core/services/auth.service';

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

    /** First mission the user belongs to, used to authorize role API calls */
    private get mission(): string {
        const user = this.auth.user();
        return user?.missions?.[0]?.name ?? '';
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
        this.userService.getAllowedRoles(user.auth.email, mission).subscribe({
            next: (allowedRoles: any) => {
                // Ensure it's an array. Backend sends Object map sometimes, but endpoint should return array based on our previous logic
                const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : Object.keys(allowedRoles).map(k => allowedRoles[k]);
                this.roles.set(rolesArray);

                this.userService.getCurrentRole(user.auth.email, mission).subscribe({
                    next: (currentRole: Role) => {
                        this.selectedRoleName.set(currentRole?.name || '');
                        this.loading.set(false);
                    },
                    error: (err) => {
                        console.error('Failed to get current role', err);
                        this.loading.set(false);
                    }
                });
            },
            error: (err) => {
                console.error('Failed to get allowed roles', err);
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
