import { FormControl, FormGroup } from '@angular/forms';
import { ProcedureStep } from '../../../core/models/procedure.model';

/**
 * Flattens a nested ProcedureStep tree into a single flat array,
 * respecting the `closedSectionIds` set for collapsed parent nodes.
 */
export function flattenSteps(steps: ProcedureStep[], closedSectionIds?: Set<string>): ProcedureStep[] {
    const result: ProcedureStep[] = [];
    const flatten = (list: ProcedureStep[]) => {
        for (const step of list) {
            result.push(step);
            const isClosed = closedSectionIds ? closedSectionIds.has(step.id) : !step.isOpen;
            if (!isClosed && step.children) {
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
 * Note: We no longer overwrite the FormControl values during a poll because
 * the input box is a local scratchpad. Overwriting it would wipe out any
 * drafted text the user has typed but not yet submitted if they lose focus.
 */
export function patchInputForm(
    form: FormGroup<Record<string, FormControl<string>>>,
    steps: ProcedureStep[],
    focusedControlId: string | null
): void {
    // Intentionally left blank. 
    // The server state is rendered in the DOM via {{ step.recordedValue }},
    // while the form controls hold unsent draft data that should not be wiped.
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
