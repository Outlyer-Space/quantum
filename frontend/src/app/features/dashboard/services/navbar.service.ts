import { Injectable, signal } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class NavbarService {
    title = signal<string>('');
    showReturnBtn = signal<boolean>(false);
    isArchived = signal<boolean>(false);
}
