import {
    ChangeDetectionStrategy,
    Component,
    input,
    output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { ProcedureStep } from '../../../../core/models/procedure.model';

export interface StepCheckEvent {
    step: ProcedureStep;
    action: 'complete' | 'rewind';
}

/**
 * Pure presentational component that renders a procedure step table.
 *
 * Consumed by both PreviewComponent (readonly=true) and
 * ViewProcedureComponent (readonly driven by isRunningInstance).
 *
 * All mutations are bubbled up via outputs so this component holds
 * zero business logic.
 */
@Component({
    selector: 'app-procedure-step-table',
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './procedure-step-table.html',
    styleUrl: './procedure-step-table.scss',
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProcedureStepTableComponent {
    /** The already-flattened (respecting isOpen) step list to render. */
    steps = input.required<ProcedureStep[]>();

    /** When true, hides editable controls and the checkbox column. */
    readonly = input<boolean>(true);

    /** The reactive FormGroup holding input-step controls. */
    inputForm = input.required<FormGroup<Record<string, FormControl<string>>>>();

    /** The IDs of sections that the user has manually closed */
    closedSectionIds = input<Set<string>>(new Set());

    /** Flat indices of steps that currently have an in-flight network request. */
    pendingUpdates = input<Set<number>>(new Set());

    /**
     * Gating predicate injected from the parent.
     * Returns true if the given step may currently be edited.
     * In readonly mode the parent always supplies `() => false`.
     */
    canEdit = input<(step: ProcedureStep) => boolean>(() => false);

    // ── Outputs ─────────────────────────────────────────────────────────────

    /** Emitted when the user clicks a section toggle arrow. */
    stepToggled = output<ProcedureStep>();

    /** Emitted when the user clicks "Set" on an input step. */
    inputSet = output<ProcedureStep>();

    /** Emitted when the user clicks "Remove" on an input step. */
    inputCleared = output<ProcedureStep>();

    /** Emitted when the user ticks/unticks a completion checkbox. */
    stepChecked = output<StepCheckEvent>();

    /** Emitted on focus of an input control (for polling guard). */
    controlFocused = output<string>();

    /** Emitted on blur of an input control (for polling guard). */
    controlBlurred = output<void>();

    // ── Template helpers ─────────────────────────────────────────────────────

    getControl(stepId: string): FormControl<string> {
        return this.inputForm().controls[stepId] as FormControl<string>;
    }

    onToggle(step: ProcedureStep): void {
        if (step.children && step.children.length > 0) {
            step.isOpen = !step.isOpen;
            this.stepToggled.emit(step);
        }
    }

    onInputSet(step: ProcedureStep): void {
        this.inputSet.emit(step);
    }

    onInputCleared(step: ProcedureStep): void {
        this.inputCleared.emit(step);
    }

    onStepChecked(step: ProcedureStep, action: 'complete' | 'rewind'): void {
        this.stepChecked.emit({ step, action });
    }

    onFocus(stepId: string): void {
        this.controlFocused.emit(stepId);
    }

    onBlur(): void {
        this.controlBlurred.emit();
    }

    getReadableTimestamp(raw?: string): string {
        if (!raw) return '';
        const match = raw.match(/^(\d{4}) - (\d{1,3})\.(\d{2}):(\d{2}):(\d{2}) UTC (.*)$/);
        if (!match) return raw;
        
        const [_, year, doy, h, m, s, username] = match;
        const date = new Date(Date.UTC(parseInt(year, 10), 0, parseInt(doy, 10), parseInt(h, 10), parseInt(m, 10), parseInt(s, 10)));
        
        const pad = (n: number) => n.toString().padStart(2, '0');
        const localDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        const localTime = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
        
        return `${localDate} ${localTime} Local Time (${username})`;
    }
}
