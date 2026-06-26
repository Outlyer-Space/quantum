import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

export type IconName = 'upload' | 'document' | 'archive' | 'live' | 'chevron-left' | 'chevron-right';

const ICON_PATHS: Record<IconName, string> = {
  'upload':        'M9 16h6v-6h4l-7-7-7 7h4v6zm-4 2h14v2H5v-2z',
  'document':      'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  'archive':       'M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z',
  'live':          'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z',
  'chevron-left':  'M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z',
  'chevron-right': 'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z',
};

@Component({
  selector: 'app-icon',
  standalone: true,
  template: `<span [innerHTML]="safeSvg()"></span>`,
  styles: [`:host { display: inline-flex; align-items: center; justify-content: center; }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  name = input.required<IconName>();
  size = input<string | number>(16);
  fill = input<string>('currentColor');

  private sanitizer = inject(DomSanitizer);

  protected safeSvg = computed((): SafeHtml => {
    const d = ICON_PATHS[this.name()] ?? '';
    const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
      fill="${this.fill()}" width="${this.size()}" height="${this.size()}">
      <path d="${d}" />
    </svg>`;
    return this.sanitizer.bypassSecurityTrustHtml(raw);
  });
}
