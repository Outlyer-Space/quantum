import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-procedure-error-dialog',
    templateUrl: './procedure-error-dialog.html',
    styleUrl: './procedure-error-dialog.scss',
    imports: [CommonModule],
    standalone: true
})
export class ProcedureErrorDialogComponent {
    /** True if the dialog is visible. */
    isOpen = input<boolean>(false);
    
    /** Error title (e.g., 'Permission Denied'). */
    errorTitle = input<string>('Error');
    
    /** Error message to display to the user. */
    errorMessage = input<string>('');

    /** Emitted when the user dismisses the dialog. */
    close = output<void>();
}
