import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { VersionInfo, SystemService } from '../../../../core/services/system.service';

@Component({
    selector: 'app-about-dialog',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './about-dialog.html',
    styleUrl: './about-dialog.scss',
})
export class AboutDialogComponent {
    private systemService = inject(SystemService);

    /** The version info to display */
    protected versionInfo = signal<VersionInfo>({
        version: 'Loading...',
        branch: 'Loading...',
        commit: 'Loading...',
        dbUrl: 'Loading...',
        dbVersion: 'Loading...',
    });

    isOpen = signal(false);

    open(): void {
        this.isOpen.set(true);
        this.systemService.getVersionInfo().subscribe(info => {
            this.versionInfo.set(info);
        });
    }

    close(): void {
        this.isOpen.set(false);
    }
}
