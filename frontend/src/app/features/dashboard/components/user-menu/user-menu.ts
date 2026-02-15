import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

@Component({
    selector: 'app-user-menu',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './user-menu.html',
    styleUrl: './user-menu.scss',
})
export class UserMenuComponent {
    userName = input.required<string>();
    callsign = input.required<string>();

    /** Emitted when the user clicks Settings */
    settingsRequested = output<void>();

    /** Emitted when the user clicks About */
    aboutRequested = output<void>();

    protected menuOpen = signal(false);

    protected toggleMenu(): void {
        this.menuOpen.update(v => !v);
    }

    protected closeMenu(): void {
        this.menuOpen.set(false);
    }

    protected logout(): void {
        // Will wire to backend later
        console.log('Logout clicked');
    }

    protected openSettings(): void {
        this.settingsRequested.emit();
    }

    protected openAbout(): void {
        this.aboutRequested.emit();
    }
}
