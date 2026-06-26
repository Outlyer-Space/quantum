import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }
  `],
})
export class App { }
