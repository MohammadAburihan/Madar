import { Injectable, Signal, computed, signal } from '@angular/core';

/**
 * The task stores whose confirmation is running or unresolved. Their reference lives only in memory, so leaving
 * the app (signing out reloads it) would lose it, and redoing the task could post it twice.
 */
@Injectable({ providedIn: 'root' })
export class OpenTasksService {
  private readonly tasks = signal<Signal<boolean>[]>([]);

  readonly any = computed(() => this.tasks().some((busy) => busy()));

  register(busy: Signal<boolean>): void {
    this.tasks.update((tasks) => [...tasks, busy]);
  }
}
