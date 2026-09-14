import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-procedure-uneditable-dialog',
    templateUrl: './procedure-uneditable-dialog.html',
    styleUrl: './procedure-uneditable-dialog.scss',
    imports: [CommonModule],
    standalone: true
})
export class ProcedureUneditableDialogComponent {
    isOpen = input<boolean>(false);
    archivedBy = input<string>('');
    archivedAt = input<string>('');

    goToDashboard = output<void>();
    goToArchive = output<void>();
}
