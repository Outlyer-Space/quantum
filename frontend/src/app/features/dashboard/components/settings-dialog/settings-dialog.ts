import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Role } from '../../models/role';

/** Mock roles — will be replaced by UserService.getAllowedRoles() */
const MOCK_ROLES: Role[] = [
    { name: 'Flight Director', callsign: 'FLIGHT' },
    { name: 'Mission Director', callsign: 'MD' },
    { name: 'Spacecraft Communications Controller', callsign: 'CC' },
    { name: 'Network and Encryption Specialist', callsign: 'PROXY' },
];

@Component({
    selector: 'app-settings-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    templateUrl: './settings-dialog.html',
    styleUrl: './settings-dialog.scss',
})
export class SettingsDialogComponent {
    /** All available roles */
    protected roles = signal<Role[]>(MOCK_ROLES);

    /** The currently selected role name (bound to radio group) */
    protected selectedRoleName = signal('Spacecraft Communications Controller');

    /** Whether the dialog is visible — controlled by parent */
    isOpen = signal(false);

    open(): void {
        this.isOpen.set(true);
    }

    close(): void {
        this.isOpen.set(false);
    }

    protected save(): void {
        const selected = this.roles().find(r => r.name === this.selectedRoleName());
        if (selected) {
            // Will wire to UserService.setCurrentRole() later
            console.log('Role saved:', selected);
        }
        this.close();
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
