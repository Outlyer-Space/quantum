import { ChangeDetectionStrategy, Component, signal, output } from '@angular/core';

@Component({
    selector: 'app-download-procedure-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './download-procedure-dialog.html',
    styleUrl: './download-procedure-dialog.scss',
})
export class DownloadProcedureDialogComponent {
    isOpen = signal(false);
    procedureTitle = signal('');

    public readonly confirmed = output<void>();

    open(title: string): void {
        this.procedureTitle.set(title);
        this.isOpen.set(true);
    }

    close(): void {
        this.isOpen.set(false);
    }

    confirm(): void {
        this.confirmed.emit();
        this.close();
    }
}
