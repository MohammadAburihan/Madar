import { LucideIconInput } from '@lucide/angular';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIconInput;
  route: string;
  /** Other sections this item stands for, e.g. More on mobile covers Money and Purchases. */
  also?: readonly string[];
}
