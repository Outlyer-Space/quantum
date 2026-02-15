import { ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProcedureTableComponent } from './components/procedure-table/procedure-table';
import { RightSidebarComponent } from './components/right-sidebar/right-sidebar';
import { UserMenuComponent } from './components/user-menu/user-menu';
import { SettingsDialogComponent } from './components/settings-dialog/settings-dialog';
import { AboutDialogComponent } from './components/about-dialog/about-dialog';

@Component({
    selector: 'app-dashboard',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        RouterLink,
        ProcedureTableComponent,
        RightSidebarComponent,
        UserMenuComponent,
        SettingsDialogComponent,
        AboutDialogComponent,
    ],
    templateUrl: './dashboard.html',
    styleUrl: './dashboard.scss',
})
export class Dashboard {
    /** Whether the right sidebar is open */
    protected sidebarOpen = signal(false);

    /** Mock user data — will be replaced by UserService later */
    protected userName = signal('Sys Admin');
    protected userCallsign = signal('CC');

    /** Dialog references */
    private settingsDialog = viewChild.required(SettingsDialogComponent);
    private aboutDialog = viewChild.required(AboutDialogComponent);

    protected toggleSidebar(): void {
        this.sidebarOpen.update(open => !open);
    }

    protected openSettings(): void {
        this.settingsDialog().open();
    }

    protected openAbout(): void {
        this.aboutDialog().open();
    }
}
