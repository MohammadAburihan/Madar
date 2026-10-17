export type WorkerTab = 'active' | 'left';

/** Today's attendance or approved leave; `marked: false` when neither is recorded yet. */
export type WorkerToday =
  | { marked: false }
  | { marked: true; status: 'Present' | 'Absent' | 'Half Day' | 'Work From Home' | 'On Leave' }
  | { marked: true; status: 'On Leave'; until: string };

export interface WorkerRow {
  id: string;
  name: string;
  designation: string | null;
  department: string | null;
  phone: string | null;
  status: string;
  /** Null when attendance and leave can't be read. */
  today: WorkerToday | null;
}

export interface WorkerPay {
  start: string;
  draft: boolean;
  gross: number;
  net: number;
  currency: string;
}

export interface WorkerDetail extends WorkerRow {
  joined: string;
  relieved: string | null;
  /** Each null when the role can't read it. */
  presentThisMonth: number | null;
  leaveLeft: number | null;
  advanceToRepay: number | null;
  pay: WorkerPay | null;
  /** The newest attendance, newest first. */
  recent: { date: string; status: string }[];
}

export interface WorkerFormValue {
  name: string;
  gender: string;
  birthDate: string;
  joined: string;
  designation: string;
  department: string;
  phone: string;
}

export interface WorkerOptions {
  genders: string[];
  designations: string[];
  departments: { id: string; name: string }[];
}
