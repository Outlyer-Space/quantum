import {
    ChangeDetectionStrategy,
    Component,
    computed,
    effect,
    inject,
    input,
    OnDestroy,
    signal,
} from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { rxResource } from '@angular/core/rxjs-interop';
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
export class PreviewComponent implements OnDestroy {

    // ── Services ──────────────────────────────────────────────────────────
    private nav = inject(NavbarService);
    private procedureService = inject(ProcedureService);

    // ── Route input (via withComponentInputBinding) ────────────────────────
    // The route is: preview/:id  — Angular binds :id directly to this signal.
    // Previously this was read via ActivatedRoute.paramMap; the input() approach
    // is the Angular 21 standard and removes the need for OnInit, the
    // ActivatedRoute injection, and the manual paramMap subscription.
    protected id = input<string>('');

    // ── Resource ──────────────────────────────────────────────────────────
    // One-shot fetch: preview never polls, so there is no pollTick.
    // rxResource re-fetches automatically if id() changes (user navigates
    // from one preview to another without the component being destroyed).
    private procedureResource = rxResource({
        params: () => {
            const id = this.id();
            // Return undefined when id is empty to keep the resource dormant
            // until the route param is available.
            if (!id) return undefined as any;
            return { id };
        },
        stream: ({ params }) => this.procedureService.getProcedureData(params.id),
    });

    // ── Derived state ─────────────────────────────────────────────────────

    /** The step tree exposed to the template. */
    protected steps = computed(() => this.procedureResource.value()?.steps ?? []);

    /** Flat list for the table (preview has no closable sections). */
    protected flattenedSteps = computed(() => flattenSteps(this.steps()));

    /**
     * The reactive FormGroup for input steps.
     *
     * In preview mode the form is purely decorative (readonly=true is passed
     * to the table), so rebuilding it when steps change is fine — there is no
     * user-typed draft state to preserve.
     */
    protected inputForm = computed<FormGroup<Record<string, FormControl<string>>>>(() =>
        new FormGroup(buildInputFormControls(this.steps()))
    );

    // ── Section collapse state ────────────────────────────────────────────
    // Uses the same Set<string> pattern as ViewProcedureComponent so the two
    // components stay consistent. The set holds IDs of manually closed sections.
    protected closedSectionIds = signal<Set<string>>(new Set());

    // ── Effects ───────────────────────────────────────────────────────────

    constructor() {
        this.nav.showReturnBtn.set(true);
        this.nav.isArchived.set(false);

        // Sync sidebar and navbar state whenever the resource resolves.
        // Previously this lived inside the paramMap callback and the getProcedureData
        // subscribe; the effect() is the correct reactive equivalent.
        effect(() => {
            const data = this.procedureResource.value();
            const id = this.id();
            if (!data?.title || !id) return;

            this.nav.title.set(`Preview: ${data.title}`);
            this.nav.procedureTitle.set(data.title);
            this.nav.sidebarProcedureId.set(id);
            this.nav.sidebarViewState.set('preview');
        });
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────

    ngOnDestroy(): void {
        this.nav.sidebarProcedureId.set(null);
        this.nav.sidebarViewState.set(null);
        this.nav.procedureTitle.set('');
    }

    // ── Template event handlers ───────────────────────────────────────────

    /**
     * Called when the user toggles a section heading open/closed.
     *
     * Uses the closedSectionIds Set (same as ViewProcedureComponent) rather
     * than the old `this.steps.set([...this.steps()])` shallow-copy trick.
     * The old approach forced flattenedSteps to recompute and the @for to
     * diff every row just to change a chevron icon. This approach is surgical:
     * only the closedSectionIds signal changes, flattenedSteps recomputes its
     * filtered slice, and only the affected rows change.
     *
     * Note: since steps() is now a computed() from the resource (not a writable
     * signal), the old steps.set() pattern would throw anyway — this is the
     * correct replacement.
     */
    protected onStepToggled(step: ProcedureStep): void {
        this.closedSectionIds.update(set => {
            const next = new Set(set);
            if (next.has(step.id)) {
                next.delete(step.id);
            } else {
                next.add(step.id);
            }
            return next;
        });
    }
}
