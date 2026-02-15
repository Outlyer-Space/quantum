import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

export interface VersionInfo {
    version: string;
    branch: string;
    commit: string;
}

@Component({
    selector: 'app-about-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './about-dialog.html',
    styleUrl: './about-dialog.scss',
})
export class AboutDialogComponent {
    /** Mock version info — will be replaced by a service call */
    protected versionInfo = signal<VersionInfo>({
        version: 'unknown',
        branch: 'unknown',
        commit: 'unknown',
    });

    isOpen = signal(false);

    open(): void {
        this.isOpen.set(true);
    }

    close(): void {
        this.isOpen.set(false);
    }
}
