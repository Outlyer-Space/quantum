import { ChangeDetectionStrategy, Component, signal, computed } from '@angular/core';
import { ArchiveSummary } from '../../../../core/models/procedure.model';

@Component({
    selector: 'app-archive-summary-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './archive-summary-dialog.html',
    styleUrl: './archive-summary-dialog.scss',
})
export class ArchiveSummaryDialogComponent {
    isOpen = signal(false);
    
    // Store the summary data
    summary = signal<ArchiveSummary | null>(null);

    // Derived signals for the participants/observers split
    participants = computed(() => {
        const s = this.summary();
        if (!s) return [];
        return s.operators.filter(o => o.isParticipant);
    });

    observers = computed(() => {
        const s = this.summary();
        if (!s) return [];
        return s.operators.filter(o => !o.isParticipant);
    });
    
    open(data: ArchiveSummary): void {
        this.summary.set(data);
        this.isOpen.set(true);
    }

    close(): void {
        this.isOpen.set(false);
    }
}
