import { ChangeDetectionStrategy, Component, computed, input, output, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActiveUser } from '../../../../core/models/procedure.model';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon';
import { AuthService } from '../../../../core/services/auth.service';

interface SidebarItem {
    label: string;
    icon: IconName;
    href?: string;
    action?: string;
}

@Component({
    selector: 'app-right-sidebar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [RouterLink, IconComponent],
    templateUrl: './right-sidebar.html',
    styleUrl: './right-sidebar.scss',
})
export class RightSidebarComponent {
    private authService = inject(AuthService);
    protected isVip = this.authService.isVip;

    isOpen = input.required<boolean>();
    viewState = input<'archived' | 'running' | 'preview' | null>(null);
    procedureId = input<string | null>(null);
    activeUsers = input<ActiveUser[]>([]);

    /** Filter the raw activeUsers list to only show those currently online */
    onlineUsers = computed(() => this.activeUsers().filter(u => u.isOnline));

    /** Emitted when the tab button is clicked */
    toggle = output<void>();

    /** Emitted when the user clicks "Upload Procedure" */
    uploadRequested = output<void>();

    protected menuItems: SidebarItem[] = [
        { label: 'Upload Procedure', icon: 'upload', action: 'upload' },
        { label: 'Documentation', icon: 'document', href: 'https://github.com/Xenon130/quantum/wiki' },
    ];

    protected onItemClick(item: SidebarItem): void {
        if (item.action === 'upload') {
            this.uploadRequested.emit();
        }
    }
}
