import { ChangeDetectionStrategy, Component, signal, computed, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';

export interface EditProcedureData {
    id: string;
    groupName: string;
    title: string;
    originalId: string;
}

@Component({
    selector: 'app-edit-procedure-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [FormsModule],
    templateUrl: './edit-procedure-dialog.html',
    styleUrl: './edit-procedure-dialog.scss',
})
export class EditProcedureDialogComponent {
    private authService = inject(AuthService);

    isOpen = signal(false);

    id = signal('');
    groupName = signal('');
    title = signal('');
    originalId = signal('');

    /** Distinct mission names for the current user, derived from their session. */
    readonly userMissions = computed(() => {
        const missions = this.authService.user()?.missions ?? [];
        return [...new Set(missions.map(m => m.name).filter(Boolean))] as string[];
    });

    public readonly saved = output<EditProcedureData>();

    open(procedure: { id: string; title: string; eventname?: string }): void {
        const parts = procedure.title.split(' - ');
        const titlePart = parts.length > 1 ? parts.slice(1).join(' - ').trim() : procedure.title.trim();

        // Prefer the explicit eventname; fall back to parsing the title string.
        const existingMission = procedure.eventname
            ?? (parts.length > 1 ? parts[0].trim() : '');

        // Snap to the canonical casing from the user's mission list so the
        // <select> binding finds an exact match and pre-selects correctly.
        const known = this.userMissions();
        const matched = known.find(m => m.toLowerCase() === existingMission.toLowerCase())
            ?? known[0]
            ?? existingMission;

        this.id.set(procedure.id);
        this.originalId.set(procedure.id);
        this.groupName.set(matched);
        this.title.set(titlePart);
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
