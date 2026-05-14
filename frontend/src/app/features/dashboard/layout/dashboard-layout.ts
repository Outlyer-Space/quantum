import { ChangeDetectionStrategy, Component, effect, inject, signal, viewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { GlobalNavbarComponent } from '../components/global-navbar/global-navbar';
import { UserAdministrationDialogComponent } from '../components/user-administration-dialog/user-administration-dialog';
import { RightSidebarComponent } from '../components/right-sidebar/right-sidebar';
import { UploadProcedureDialogComponent } from '../components/upload-procedure-dialog/upload-procedure-dialog';
import { NavbarService } from '../services/navbar.service';

@Component({
    selector: 'app-dashboard-layout',
    standalone: true,
    imports: [RouterOutlet, GlobalNavbarComponent, UserAdministrationDialogComponent, RightSidebarComponent, UploadProcedureDialogComponent],
    templateUrl: './dashboard-layout.html',
    styleUrl: './dashboard-layout.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardLayoutComponent {
    protected nav = inject(NavbarService);
    private titleService = inject(Title);

    isUserAdminOpen = signal<boolean>(false);

    private uploadDialog = viewChild.required(UploadProcedureDialogComponent);

    constructor() {
        effect(() => {
            const state = this.nav.sidebarViewState();
            const title = this.nav.procedureTitle();

            if (!state || !title) {
                this.titleService.setTitle('Dashboard');
                return;
            }

            let stateLabel = '';
            switch (state) {
                case 'running': stateLabel = 'Running'; break;
                case 'archived': stateLabel = 'Archive'; break;
                case 'preview': stateLabel = 'Preview'; break;
            }

            this.titleService.setTitle(`${title} | ${stateLabel}`);
        });
    }

    openUserAdmin(): void {
        this.isUserAdminOpen.set(true);
    }

    closeUserAdmin(): void {
        this.isUserAdminOpen.set(false);
    }

    protected toggleSidebar(): void {
        this.nav.sidebarOpen.update(v => !v);
    }

    protected openUploadProcedure(): void {
        this.uploadDialog().open();
    }
}
