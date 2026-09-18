import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface BackgroundImage {
    src: string;
    credit: string;
}

const BACKGROUNDS: BackgroundImage[] = [
    { src: 'media/background/acidalia-planitia-1600.jpg', credit: 'Acidalia Planitia (Mars) - NASA/JPL-Caltech/Univ. of Arizona' },
    { src: 'media/background/jezero-crater-1600.jpg', credit: 'Jezero Crater (Mars) - NASA/JPL-Caltech/Univ. of Arizona' },
    { src: 'media/background/europa-remastered-1600.jpg', credit: "Jupiter's Moon Europa - NASA, JPL-Caltech, SETI Institute" },
    { src: 'media/background/cosmic-fireball-falling-over-alma-1920.jpg', credit: 'Fiery Voyage Over ALMA - ESO/C. Malin' },
    { src: 'media/background/star-trails-eso-paranal-1920.jpg', credit: 'Star Trails - Univ. of Arizona' },
    { src: 'media/background/mars-sand-dunes-1920.jpg', credit: 'Martian Sand Dunes - NASA/JPL-Caltech' },
    { src: 'media/background/messy-galaxy-hubble-1920.jpg', credit: 'Hubble Galaxy - NASA/JPL-Caltech' },
    { src: 'media/background/magellanic-clouds-1920.jpg', credit: 'Magellanic Clouds above the Atacama Desert in Chile - ESO/Y. Beletsky' },
];

const TECH_LOGOS = [
    { src: 'media/logos/AUD_audacy_logo_white.png', alt: 'Audacy' },
    { src: 'media/logos/AUD_angularjs_logo_white.png', alt: 'Angular' },
    { src: 'media/logos/AUD_mongodb_logo_white.png', alt: 'MongoDB' },
    { src: 'media/logos/AUD_nodejs_logo_white.png', alt: 'Node.js' },
    { src: 'media/logos/AUD_docker_logo_white.png', alt: 'Docker' },
    { src: 'media/logos/AUD_github_logo_white.png', alt: 'GitHub' },
];

@Component({
    selector: 'app-login',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ReactiveFormsModule],
    templateUrl: './login.html',
    styleUrl: './login.scss',
})
export class Login {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private titleService = inject(Title);
    private route = inject(ActivatedRoute);

    /** The active auth provider ('Mongo' or 'Microsoft') */
    protected provider = signal<string>('Mongo');

    // Human-readable messages for error codes passed back via ?error= query param.
    // Set either by the SSO callback redirect or by authInterceptor, which maps the
    // API's 401 reason code onto one of these so the cause is stated accurately.
    private readonly SSO_ERRORS: Record<string, string> = {
        incomplete_profile: 'Your Microsoft account has no display name. Please ask your administrator to add one in Microsoft Entra ID. Signing in again will not resolve this.',
        session_expired: 'Your session could not be restored, so you have been signed out. Please sign in again — if this keeps happening, contact your administrator.',
        auth_failed: 'Microsoft sign-in failed. Please try again or contact your administrator.',
    };

    constructor() {
        this.titleService.setTitle('Login | Quantum');

        // Surface SSO errors redirected back with ?error=<code>
        const errorCode = this.route.snapshot.queryParamMap.get('error');
        if (errorCode) {
            this.flashMessage.set(this.SSO_ERRORS[errorCode] ?? 'Sign-in failed. Please try again.');
        }

        this.authService.getAuthConfig().subscribe({
            next: (config) => {
                this.provider.set(config.provider);
            },
            error: (err) => {
                console.error('Failed to load auth config:', err);
            }
        });
    }

    /** Redirect to Microsoft Azure AD SSO auth route */
    protected onMicrosoftLogin(): void {
        window.location.href = '/login_oauth2';
    }

    /** Random background chosen once on init */
    protected background = signal(BACKGROUNDS[Math.floor(Math.random() * BACKGROUNDS.length)]);
    protected backgroundUrl = computed(() => `url('${this.background().src}')`);
    protected imageCredit = computed(() => this.background().credit);

    /** Tech stack logos for footer */
    protected logos = signal(TECH_LOGOS);

    /** Reactive login form */
    protected loginForm = this.fb.nonNullable.group({
        email: ['', [Validators.required, Validators.email]],
        password: ['', Validators.required],
    });

    /** Flash message signal (e.g. for errors) */
    protected flashMessage = signal('');
    protected isLoading = signal(false);

    protected onSubmit(): void {
        this.flashMessage.set(''); // Clear previous messages

        if (this.loginForm.invalid) {
            this.loginForm.markAllAsTouched();
            return;
        }

        this.isLoading.set(true);
        const { email, password } = this.loginForm.getRawValue();

        this.authService.login(email, password).subscribe({
            next: () => {
                this.isLoading.set(false);
                // login handles navigation to /dashboard internally on success
            },
            error: (err: Error) => {
                this.isLoading.set(false);
                this.flashMessage.set(err.message);
            }
        });
    }
}
