import { ChangeDetectionStrategy, Component, input } from '@angular/core';

interface SidebarItem {
    label: string;
    icon: string;
    href?: string;
    action?: string;
}

@Component({
    selector: 'app-right-sidebar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './right-sidebar.html',
    styleUrl: './right-sidebar.scss',
})
export class RightSidebarComponent {
    isOpen = input.required<boolean>();

    protected menuItems: SidebarItem[] = [
        { label: 'Upload Procedure', icon: 'upload', action: 'upload' },
        { label: 'Documentation', icon: 'document', href: 'https://github.com/Xenon130/quantum/wiki' },
    ];

    protected onItemClick(item: SidebarItem): void {
        if (item.action === 'upload') {
            // Upload modal will be wired later
            console.log('Upload Procedure clicked');
        }
    }
}
