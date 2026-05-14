import {
    ChangeDetectionStrategy,
    Component,
    signal,
    computed,
    OnInit,
    OnDestroy,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { NavbarService } from '../../services/navbar.service';
import { ProcedureService } from '../../../../core/services/procedure.service';
import { ProcedureStep } from '../../../../core/models/procedure.model';
import { flattenSteps, buildInputFormControls } from '../../utils/procedure-step.utils';
import { ProcedureStepTableComponent } from '../procedure-step-table/procedure-step-table';

@Component({
    selector: 'app-procedure-preview',
    imports: [ReactiveFormsModule, ProcedureStepTableComponent],
    templateUrl: './preview.html',
    styleUrl: './preview.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreviewComponent implements OnInit, OnDestroy {
    protected steps = signal<ProcedureStep[]>([]);
    protected inputForm = new FormGroup<Record<string, FormControl<string>>>({});
    protected flattenedSteps = computed(() => flattenSteps(this.steps()));

    constructor(
        private route: ActivatedRoute,
        private nav: NavbarService,
        private procedureService: ProcedureService,
    ) {
        this.nav.showReturnBtn.set(true);
        this.nav.isArchived.set(false);
    }

    ngOnInit(): void {
        this.route.paramMap.subscribe(params => {
            const id = params.get('id');
            if (!id) return;

            this.nav.sidebarProcedureId.set(id);
            this.nav.sidebarViewState.set('preview');

            this.procedureService.getProcedureData(id).subscribe({
                next: (data) => {
                    this.steps.set(data.steps);
                    this.nav.title.set(`Preview: ${data.title}`);
                    this.nav.procedureTitle.set(data.title);
                    this.inputForm = new FormGroup(buildInputFormControls(data.steps));
                },
                error: (err) => console.error('Failed to load procedure data:', err),
            });
        });
    }

    ngOnDestroy(): void {
        this.nav.sidebarProcedureId.set(null);
        this.nav.sidebarViewState.set(null);
        this.nav.procedureTitle.set('');
    }

    protected onStepToggled(step: ProcedureStep): void {
        this.steps.set([...this.steps()]);
    }
}
