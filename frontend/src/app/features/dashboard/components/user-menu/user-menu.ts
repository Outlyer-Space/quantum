import { ChangeDetectionStrategy, Component, input, output, signal, inject } from '@angular/core';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
    selector: 'app-user-menu',
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './user-menu.html',
    styleUrl: './user-menu.scss',
})
export class UserMenuComponent {
    private auth = inject(AuthService);

    userName = input.required<string>();
    callsign = input.required<string>();
    showAdminBtn = input<boolean>(false);

    /** Emitted when the user clicks Settings */
    settingsRequested = output<void>();

    /** Emitted when the user clicks About */
    aboutRequested = output<void>();

    /** Emitted when the user clicks User Administration */
    userAdminRequested = output<void>();

    protected menuOpen = signal(false);

    protected toggleMenu(): void {
        this.menuOpen.update(v => !v);
    }

    protected closeMenu(): void {
        this.menuOpen.set(false);
    }

    protected logout(): void {
        this.auth.logout();
    }

    protected openSettings(): void {
        this.settingsRequested.emit();
    }

    protected openAbout(): void {
        this.aboutRequested.emit();
    }

    protected openUserAdmin(): void {
        this.userAdminRequested.emit();
    }
}
