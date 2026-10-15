import { TestBed } from '@angular/core/testing';
import { fakeErpnext } from '../../../testing/fake-erpnext';
import { ProjectDirectoryService } from './project-directory.service';

describe('ProjectDirectoryService', () => {
  it("lists the company's open projects by name", async () => {
    const { listCalls } = fakeErpnext({
      Project: () => [{ name: 'PROJ-0001', project_name: 'Garden installation' }],
    });
    expect(await TestBed.inject(ProjectDirectoryService).open('Rehan Nursery')).toEqual([
      { id: 'PROJ-0001', name: 'Garden installation' },
    ]);
    expect(listCalls[0].query.filters).toEqual([
      ['company', '=', 'Rehan Nursery'],
      ['status', '=', 'Open'],
    ]);
  });
});
