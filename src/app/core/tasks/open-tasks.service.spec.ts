import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { OpenTasksService } from './open-tasks.service';

describe('OpenTasksService', () => {
  it('is open while any registered task has a confirmation running or unresolved', () => {
    const tasks = TestBed.inject(OpenTasksService);
    const sale = signal(false);
    const delivery = signal(false);
    tasks.register(sale);
    tasks.register(delivery);
    expect(tasks.any()).toBe(false);
    delivery.set(true);
    expect(tasks.any()).toBe(true);
    delivery.set(false);
    expect(tasks.any()).toBe(false);
  });
});
