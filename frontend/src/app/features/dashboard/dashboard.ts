import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ProcedureTableComponent } from './components/procedure-table/procedure-table';
import { NavbarService } from './services/navbar.service';

@Component({
    selector: 'app-dashboard',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ProcedureTableComponent],
    templateUrl: './dashboard.html',
    styleUrl: './dashboard.scss',
})
export class Dashboard {
    constructor(private nav: NavbarService) {
        this.nav.title.set('');
        this.nav.showReturnBtn.set(false);
        this.nav.isArchived.set(false);
        // No procedure context on the dashboard home page
        this.nav.sidebarViewState.set(null);
        this.nav.sidebarProcedureId.set(null);
        this.nav.sidebarActiveUsers.set([]);
        this.nav.procedureTitle.set('');
    }
}
