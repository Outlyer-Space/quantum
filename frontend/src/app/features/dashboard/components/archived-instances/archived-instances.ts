import { ChangeDetectionStrategy, Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, timer, merge } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { NavbarService } from '../../services/navbar.service';
import { ProcedureService } from '../../../../core/services/procedure.service';
import { ArchivedInstance } from '../../../../core/models/procedure.model';

@Component({
    selector: 'app-archived-instances',
    imports: [CommonModule, RouterLink],
    templateUrl: './archived-instances.html',
    styleUrl: './archived-instances.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArchivedInstancesComponent implements OnInit, OnDestroy {
    private destroy$ = new Subject<void>();

    protected procedureId = signal<string>('');
    protected procedureTitle = signal<string>('');
    protected instances = signal<ArchivedInstance[]>([]);

    constructor(
        private route: ActivatedRoute,
        private nav: NavbarService,
        private procedureService: ProcedureService
    ) {
        this.nav.showReturnBtn.set(true);
        this.nav.isArchived.set(true);
    }

    ngOnInit(): void {
        this.route.paramMap.pipe(
            takeUntil(this.destroy$)
        ).subscribe(params => {
            const id = params.get('id');
            if (id) {
                this.procedureId.set(id);

                // Cancel any previous polling loop and start a fresh one
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
                        this.instances.set(data.archived);
                        this.nav.title.set(`AS-Run Archive.${id} - ${data.title}`);
                    },
                    error: (err) => console.error('Failed to load archived instances:', err)
                });
            }
        });
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }
}
