import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { GlobalNavbarComponent } from '../components/global-navbar/global-navbar';
import { UserAdministrationDialogComponent } from '../components/user-administration-dialog/user-administration-dialog';

@Component({
    selector: 'app-dashboard-layout',
    standalone: true,
    imports: [RouterOutlet, GlobalNavbarComponent, UserAdministrationDialogComponent],
    templateUrl: './dashboard-layout.html',
    styleUrl: './dashboard-layout.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardLayoutComponent {
    isUserAdminOpen = signal<boolean>(false);

    openUserAdmin(): void {
        this.isUserAdminOpen.set(true);
    }

    closeUserAdmin(): void {
        this.isUserAdminOpen.set(false);
    }
}
