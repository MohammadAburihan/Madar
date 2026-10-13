import { AfterViewInit, Component, inject, viewChild } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { NativeShellService } from './core/platform/native-shell.service';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet],
  template: `
    <ion-app>
      <ion-router-outlet />
    </ion-app>
  `,
})
export class App implements AfterViewInit {
  private readonly nativeShell = inject(NativeShellService);
  private readonly outlet = viewChild.required(IonRouterOutlet);

  ngAfterViewInit(): void {
    void this.nativeShell.init(this.outlet());
  }
}
