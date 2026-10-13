import { LucideIconInput } from '@lucide/angular';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIconInput;
  route: string;
}
