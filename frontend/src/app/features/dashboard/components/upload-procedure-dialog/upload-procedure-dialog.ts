import { ChangeDetectionStrategy, Component, ElementRef, signal, computed, viewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProcedureService } from '../../../../core/services/procedure.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
    selector: 'app-upload-procedure-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CommonModule, FormsModule],
    templateUrl: './upload-procedure-dialog.html',
    styleUrl: './upload-procedure-dialog.scss',
})
export class UploadProcedureDialogComponent {
    private procedureService = inject(ProcedureService);
    private authService = inject(AuthService);

    isOpen = signal(false);

    /** The selected file (null when nothing has been picked yet) */
    protected selectedFile = signal<File | null>(null);

    /** Status / feedback message shown in the toast area */
    protected toastMessage = signal('');
    protected toastType = signal<'error' | 'success' | 'info'>('info');

    /** Whether the Master Template accordion is expanded */
    protected templateExpanded = signal(true);

    /** Whether an upload is currently in progress */
    protected uploading = signal(false);

    /** Missions available to the current user */
    protected availableMissions = computed(() =>
        this.authService.user()?.missions?.map(m => m.name) ?? []
    );

    /** The mission selected for this upload */
    protected selectedMission = signal<string>('');

    /** Hidden file input reference */
    private fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

    open(): void {
        this.isOpen.set(true);
        this.reset();
        // Pre-select the first available mission
        const missions = this.availableMissions();
        if (missions.length > 0) this.selectedMission.set(missions[0] ?? '');
    }

    close(): void {
        this.isOpen.set(false);
        this.reset();
    }

    /** Trigger the hidden file input */
    protected browse(): void {
        this.fileInput()?.nativeElement.click();
    }

    /** Handle file selection from the native file picker */
    protected onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files && input.files.length > 0) {
            const file = input.files[0];

            if (!file.name.endsWith('.xlsx')) {
                this.toastType.set('error');
                this.toastMessage.set('Only .xlsx files are accepted.');
                this.selectedFile.set(null);
                return;
            }

            if (file.size > 1_048_576) {
                this.toastType.set('error');
                this.toastMessage.set('File size must be under 1 MB.');
                this.selectedFile.set(null);
                return;
            }

            this.toastType.set('info');
            this.toastMessage.set('');
            this.selectedFile.set(file);
        }
    }

    /** Submit / add the selected file */
    protected submit(): void {
        const file = this.selectedFile();

        if (!file) {
            this.toastType.set('error');
            this.toastMessage.set('No file passed. Please upload an xlsx file.');
            return;
        }

        const parts = file.name.split(' - ');
        if (parts.length < 2) {
            this.toastType.set('error');
            this.toastMessage.set(
                "File must be named 'index - title.xlsx'. E.g: '1.1 - OBC Bootup.xlsx'",
            );
            return;
        }

        const mission = this.selectedMission();
        if (!mission) {
            this.toastType.set('error');
            this.toastMessage.set('Please select a mission before uploading.');
            return;
        }

        // Get the current user's name for the upload metadata
        const user = this.authService.user();
        const username = user?.auth?.name || 'Unknown';

        this.uploading.set(true);
        this.toastType.set('info');
        this.toastMessage.set('Uploading...');

        this.procedureService.uploadProcedure(file, username, mission).subscribe({
            next: (response) => {
                this.uploading.set(false);
                if (response.err_desc && response.err_desc !== null && response.error_code !== 0) {
                    this.toastType.set('error');
                    this.toastMessage.set(`Error: ${response.err_desc}`);
                } else if (response.err_desc === 'file updated') {
                    this.toastType.set('success');
                    this.toastMessage.set(`Success: Procedure updated from ${file.name}`);
                    this.selectedFile.set(null);
                } else {
                    this.toastType.set('success');
                    this.toastMessage.set(`Success: Procedure uploaded from ${file.name}`);
                    this.selectedFile.set(null);
                }

                // Force all dashboard tables to refresh and see the new upload
                this.procedureService.requestRefresh();

                // Reset the native file input so the same file can be re-selected
                const input = this.fileInput()?.nativeElement;
                if (input) input.value = '';
            },
            error: (err) => {
                this.uploading.set(false);
                this.toastType.set('error');
                this.toastMessage.set('Upload failed. Please try again.');
                console.error('Upload error:', err);
            }
        });
    }

    /** Toggle the Master Template accordion */
    protected toggleTemplate(): void {
        this.templateExpanded.update(v => !v);
    }

    private reset(): void {
        this.selectedFile.set(null);
        this.toastMessage.set('');
        this.toastType.set('info');
        this.templateExpanded.set(true);
        this.uploading.set(false);
        this.selectedMission.set(this.availableMissions()[0] ?? '');

        const input = this.fileInput()?.nativeElement;
        if (input) input.value = '';
    }
}
