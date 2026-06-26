import { ChangeDetectionStrategy, Component, signal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface EditProcedureData {
    id: string; // The index
    groupName: string;
    title: string;
    originalId: string; // Used to uniquely identify which procedure was edited
}

@Component({
    selector: 'app-edit-procedure-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    templateUrl: './edit-procedure-dialog.html',
    styleUrl: './edit-procedure-dialog.scss',
})
export class EditProcedureDialogComponent {
    isOpen = signal(false);

    id = signal('');
    groupName = signal('');
    title = signal('');
    originalId = signal('');

    public readonly saved = output<EditProcedureData>();

    open(procedure: { id: string; title: string }): void {
        const parts = procedure.title.split(' - ');
        const groupName = parts.length > 1 ? parts[0].trim() : '';
        const title = parts.length > 1 ? parts.slice(1).join(' - ').trim() : procedure.title.trim();

        this.id.set(procedure.id);
        this.originalId.set(procedure.id);
        this.groupName.set(groupName);
        this.title.set(title);

        this.isOpen.set(true);
    }

    close(): void {
        this.isOpen.set(false);
    }

    save(): void {
        this.saved.emit({
            id: this.id(),
            groupName: this.groupName(),
            title: this.title(),
            originalId: this.originalId()
        });
        this.close();
    }
}
