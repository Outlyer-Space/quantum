import { FormControl, FormGroup } from '@angular/forms';
import { ProcedureStep } from '../../../core/models/procedure.model';

/**
 * Flattens a nested ProcedureStep tree into a single flat array,
 * respecting the `isOpen` flag for collapsed parent nodes.
 */
export function flattenSteps(steps: ProcedureStep[]): ProcedureStep[] {
    const result: ProcedureStep[] = [];
    const flatten = (list: ProcedureStep[]) => {
        for (const step of list) {
            result.push(step);
            if (step.isOpen && step.children) {
                flatten(step.children);
            }
        }
    };
    flatten(steps);
    return result;
}

/**
 * Walks a step tree recursively and builds a flat map of
 * FormControls for every step with type === 'input'.
 */
export function buildInputFormControls(
    steps: ProcedureStep[]
): Record<string, FormControl<string>> {
    const controls: Record<string, FormControl<string>> = {};
    const walk = (list: ProcedureStep[]) => {
        for (const step of list) {
            if (step.type === 'input') {
                controls[step.id] = new FormControl(step.inputValue ?? '', {
                    nonNullable: true,
                });
            }
            if (step.children) walk(step.children);
        }
    };
    walk(steps);
    return controls;
}

/**
 * Patches an existing FormGroup with updated values from a new steps array.
 * Skips the control currently focused by the user to avoid interrupting typing.
 */
export function patchInputForm(
    form: FormGroup<Record<string, FormControl<string>>>,
    steps: ProcedureStep[],
    focusedControlId: string | null
): void {
    const walk = (list: ProcedureStep[]) => {
        for (const step of list) {
            if (step.type === 'input') {
                const ctrl = form.controls[step.id];
                if (ctrl && step.id !== focusedControlId) {
                    ctrl.setValue(step.inputValue ?? '', { emitEvent: false });
                }
            }
            if (step.children) walk(step.children);
        }
    };
    walk(steps);
}

/**
 * Walks all leaf nodes (no children) from the full tree regardless of isOpen,
 * sorted by flatIndex. Used by the sequential gating check.
 */
export function getAllActionableSteps(steps: ProcedureStep[]): ProcedureStep[] {
    const result: ProcedureStep[] = [];
    const walk = (list: ProcedureStep[]) => {
        for (const step of list) {
            if (!step.children || step.children.length === 0) {
                result.push(step);
            } else {
                walk(step.children);
            }
        }
    };
    walk(steps);
    return result.sort((a, b) => a.flatIndex - b.flatIndex);
}
