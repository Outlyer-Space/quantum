import { ChangeDetectionStrategy, Component, signal, OnInit, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { NavbarService } from '../../services/navbar.service';
import { ProcedureService } from '../../../../core/services/procedure.service';
import { ProcedureStep } from '../../../../core/models/procedure.model';

@Component({
    selector: 'app-procedure-preview',
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './preview.html',
    styleUrl: './preview.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PreviewComponent implements OnInit {
    private fb = inject(FormBuilder);

    protected procedureId = signal<string>('');
    protected procedureTitle = signal<string>('');
    protected steps = signal<ProcedureStep[]>([]);

    /* Dynamic FormGroup: keys are step IDs, values are FormControls for input steps */
    protected inputForm = new FormGroup<Record<string, FormControl<string>>>({});

    constructor(
        private route: ActivatedRoute,
        private nav: NavbarService,
        private procedureService: ProcedureService
    ) {
        this.nav.showReturnBtn.set(true);
        this.nav.isArchived.set(false);
    }

    protected flattenedSteps = computed(() => {
        const result: ProcedureStep[] = [];
        const flatten = (steps: ProcedureStep[]) => {
            for (const step of steps) {
                result.push(step);
                if (step.isOpen && step.children) {
                    flatten(step.children);
                }
            }
        };
        flatten(this.steps());
        return result;
    });

    ngOnInit(): void {
        this.route.paramMap.subscribe(params => {
            const id = params.get('id');
            if (id) {
                this.procedureId.set(id);
                this.procedureService.getProcedureData(id).subscribe({
                    next: (data) => {
                        this.procedureTitle.set(data.title);
                        this.steps.set(data.steps);
                        this.nav.title.set(`Preview: ${id} - ${data.title}`);
                        this.buildInputForm(data.steps);
                    },
                    error: (err) => console.error('Failed to load procedure data:', err)
                });
            }
        });
    }

    /** Recursively create FormControls for every 'input' type step */
    private buildInputForm(steps: ProcedureStep[]): void {
        const controls: Record<string, FormControl<string>> = {};
        const walk = (list: ProcedureStep[]) => {
            for (const step of list) {
                if (step.type === 'input') {
                    controls[step.id] = new FormControl(step.inputValue ?? '', { nonNullable: true });
                }
                if (step.children) walk(step.children);
            }
        };
        walk(steps);
        this.inputForm = new FormGroup(controls);
    }

    /** Get the FormControl for a specific step id */
    protected getControl(stepId: string): FormControl<string> {
        return this.inputForm.controls[stepId] as FormControl<string>;
    }

    protected toggleStep(step: ProcedureStep): void {
        if (step.children && step.children.length > 0) {
            step.isOpen = !step.isOpen;
            this.steps.set([...this.steps()]);
        }
    }

    protected setInputValue(step: ProcedureStep): void {
        const ctrl = this.getControl(step.id);
        if (ctrl) {
            step.recordedValue = ctrl.value;
            ctrl.reset('');
            this.steps.set([...this.steps()]);
        }
    }
}
