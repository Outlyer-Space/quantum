import { ChangeDetectionStrategy, Component, signal, viewChild } from '@angular/core';
import { ProcedureTableComponent } from './components/procedure-table/procedure-table';
import { RightSidebarComponent } from './components/right-sidebar/right-sidebar';
import { UploadProcedureDialogComponent } from './components/upload-procedure-dialog/upload-procedure-dialog';
import { NavbarService } from './services/navbar.service';

@Component({
    selector: 'app-dashboard',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [
        ProcedureTableComponent,
        RightSidebarComponent,
        UploadProcedureDialogComponent,
    ],
    templateUrl: './dashboard.html',
    styleUrl: './dashboard.scss',
})
export class Dashboard {
    /** Whether the right sidebar is open */
    protected sidebarOpen = signal(false);

    constructor(private nav: NavbarService) {
        this.nav.title.set('');
        this.nav.showReturnBtn.set(false);
        this.nav.isArchived.set(false);
    }

    /** Dialog references */
    private uploadProcedureDialog = viewChild.required(UploadProcedureDialogComponent);

    protected toggleSidebar(): void {
        this.sidebarOpen.update(open => !open);
    }

    protected openUploadProcedure(): void {
        this.uploadProcedureDialog().open();
    }
}
