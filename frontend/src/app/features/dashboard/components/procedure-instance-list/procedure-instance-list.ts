import {
    ChangeDetectionStrategy,
    Component,
    input,
    signal,
    OnInit,
    OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, timer, merge } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { NavbarService } from '../../services/navbar.service';
import { ProcedureService } from '../../../../core/services/procedure.service';
import { ProcedureInstance, ArchivedInstance } from '../../../../core/models/procedure.model';

/**
 * Unified instance list component replacing both RunningInstancesComponent
 * and ArchivedInstancesComponent. Controlled via the `mode` input signal.
 */
@Component({
    selector: 'app-procedure-instance-list',
    imports: [CommonModule, RouterLink],
    templateUrl: './procedure-instance-list.html',
    styleUrl: './procedure-instance-list.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedureInstanceListComponent implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();

    /** Injected by the router via withComponentInputBinding() */
    mode = input.required<'running' | 'archived'>();

    protected procedureId = signal<string>('');
    protected procedureTitle = signal<string>('');
    protected instances = signal<(ProcedureInstance | ArchivedInstance)[]>([]);

    constructor(
        private route: ActivatedRoute,
        private nav: NavbarService,
        private procedureService: ProcedureService
    ) {
        this.nav.showReturnBtn.set(true);
    }

    ngOnInit(): void {
        const isArchived = this.mode() === 'archived';
        this.nav.isArchived.set(isArchived);
        this.nav.sidebarViewState.set(isArchived ? 'archived' : 'running');

        this.route.paramMap.pipe(
            takeUntil(this.destroy$)
        ).subscribe(params => {
            const id = params.get('id');
            if (!id) return;

            this.procedureId.set(id);
            this.nav.sidebarProcedureId.set(id);

            // Reset any previous polling loop on param change
            this.destroy$.next();

            merge(
                timer(0, 5000),
                this.procedureService.refresh$
            ).pipe(
                switchMap(() => this.procedureService.getAllInstances(id)),
                takeUntil(this.destroy$)
            ).subscribe({
                next: (data) => {
                    this.procedureTitle.set(data.title);
                    this.nav.procedureTitle.set(data.title);
                    this.instances.set(isArchived ? data.archived : data.running);

                    const navLabel = isArchived
                        ? `Archive List: ${data.title} (${id})`
                        : `Active Instances: ${data.title} (${id})`;
                    this.nav.title.set(navLabel);
                },
                error: (err) => console.error(`Failed to load ${this.mode()} instances:`, err),
            });
        });
    }

    ngOnDestroy(): void {
        this.nav.sidebarProcedureId.set(null);
        this.nav.sidebarViewState.set(null);
        this.nav.procedureTitle.set('');
        this.destroy$.next();
        this.destroy$.complete();
    }

    /** Type guard to check if the instance is an archived one */
    protected isArchived(instance: ProcedureInstance | ArchivedInstance): instance is ArchivedInstance {
        return this.mode() === 'archived';
    }
}
