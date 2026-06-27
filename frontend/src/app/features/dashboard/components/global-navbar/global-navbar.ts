import { ChangeDetectionStrategy, Component, viewChild, computed, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { UserMenuComponent } from '../user-menu/user-menu';
import { SettingsDialogComponent } from '../settings-dialog/settings-dialog';
import { AboutDialogComponent } from '../about-dialog/about-dialog';
import { NavbarService } from '../../services/navbar.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
    selector: 'app-global-navbar',
    imports: [CommonModule, RouterLink, UserMenuComponent, SettingsDialogComponent, AboutDialogComponent],
    templateUrl: './global-navbar.html',
    styleUrl: './global-navbar.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[class.archive-navbar]': 'nav.isArchived()'
    }
})
export class GlobalNavbarComponent {
    private auth = inject(AuthService);
    constructor(public nav: NavbarService) { }

    userName = computed(() => this.auth.user()?.auth?.name || 'Unknown User');

    activeMission = computed(() => this.nav.activeMission() || this.auth.globalActiveMission());

    userCallsign = computed(() => {
        const user = this.auth.user();
        if (!user?.missions?.length) return 'VIP';

        const missionName = this.activeMission();
        const mission = missionName
            ? user.missions.find(m => m.name?.toLowerCase() === missionName.toLowerCase())
            : user.missions[0];

        return mission?.currentRole?.callsign || 'VIP';
    });

    isLeadRole = computed(() => {
        const callsign = this.userCallsign();
        return callsign === 'FLIGHT' || callsign === 'MD' || callsign === 'TD';
    });

    /** Bubbles user-admin dialog request up to the dashboard layout */
    userAdminRequested = output<void>();

    private settingsDialog = viewChild.required(SettingsDialogComponent);
    private aboutDialog = viewChild.required(AboutDialogComponent);

    protected openSettings(): void {
        this.settingsDialog().open();
    }

    protected openAbout(): void {
        this.aboutDialog().open();
    }

    protected openUserAdmin(): void {
        this.userAdminRequested.emit();
    }
}
