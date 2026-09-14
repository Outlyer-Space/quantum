import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type DialogVariant = 'error' | 'locked' | 'uneditable';

export interface DialogState {
    variant: DialogVariant;
    title: string;
    message: string;
    /** Only present for 'locked' and 'uneditable' variants (may be empty while re-fetch is in flight). */
    archivedBy?: string;
    archivedAt?: string;
}

/**
 * Single unified status dialog that replaces the separate error and uneditable dialogs.
 *
 * Variants:
 *  - 'error'      → generic action failure (permission denied, conflict, etc.)
 *                   Shows a Dismiss button only.
 *  - 'locked'     → procedure was closed by another user while this user was editing (423).
 *                   Shows Go to Archive + Back to Dashboard buttons.
 *  - 'uneditable' → procedure discovered as closed on the next poll tick.
 *                   Shows Go to Archive + Back to Dashboard buttons.
 *
 * The parent drives this entirely through the `state` input signal.
 * A null state hides the dialog.
 */
@Component({
    selector: 'app-procedure-status-dialog',
    templateUrl: './procedure-status-dialog.html',
    styleUrl: './procedure-status-dialog.scss',
    imports: [CommonModule],
    standalone: true
})
export class ProcedureStatusDialogComponent {
    /** Pass null to hide the dialog. */
    state = input<DialogState | null>(null);

    /** Emitted when the user clicks Dismiss on an 'error' variant. */
    dismiss = output<void>();

    /** Emitted when the user chooses to navigate to the archive. */
    goToArchive = output<void>();

    /** Emitted when the user chooses to go back to the dashboard. */
    goToDashboard = output<void>();

    protected isNavigationVariant(variant: DialogVariant): boolean {
        return variant === 'locked' || variant === 'uneditable';
    }
}
