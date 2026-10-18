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
  /** Hours logged in the last seven days; null when timesheets can't be read. */
  hoursLastWeek: number | null;
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

export type AttendanceStatus = 'Present' | 'Absent' | 'Half Day' | 'Work From Home';

/** One worker on the day's sheet: open to mark, already marked, or covered by approved leave. */
export interface SheetRow {
  id: string;
  name: string;
  designation: string | null;
  state:
    | { kind: 'open' }
    | { kind: 'marked'; status: string }
    /** Saved but not submitted, in Desk: it blocks marking until it is submitted or deleted. */
    | { kind: 'draft'; status: string }
    | { kind: 'leave'; until: string };
}

/** What saving one worker's attendance came to. */
export type MarkResult = 'marked' | 'already' | 'unresolved' | 'failed';

export type LeaveTab = 'waiting' | 'decided';

export interface LeaveRequest {
  id: string;
  worker: string;
  workerName: string;
  leaveType: string;
  from: string;
  to: string;
  days: number;
  reason: string;
  status: string;
  /** Approved or rejected, and submitted in ERPNext. */
  decided: boolean;
  requested: string;
}

/** A leave type the worker can take: days left on their allocation, or unpaid. */
export interface LeaveBalance {
  type: string;
  /** Null for unpaid leave, which has no allocation. */
  left: number | null;
}

export interface LeaveFormValue {
  worker: string;
  leaveType: string;
  from: string;
  to: string;
  reason: string;
}

export type LeaveDecision = 'Approved' | 'Rejected';

export interface ShiftType {
  name: string;
  /** "07:00" */
  start: string;
  end: string;
}

export interface ShiftFormValue {
  worker: string;
  shift: string;
  from: string;
  /** Empty to keep it with no end. */
  until: string;
}

export interface AdvanceFormValue {
  worker: string;
  amount: number;
  /** Mode of Payment it is paid from. */
  mode: string;
  account: string;
  purpose: string;
  date: string;
}

export interface SalaryFormValue {
  worker: string;
  monthly: number;
  from: string;
}

/** A worker on the month's pay: their salary slip, or that they have no salary to make one from. */
export interface PayRow {
  id: string;
  name: string;
  /** False for an inactive worker, for whom Frappe HR makes no slip. */
  active: boolean;
  hasSalary: boolean;
  slip: { name: string; confirmed: boolean; gross: number; net: number } | null;
}

export interface HoursFormValue {
  worker: string;
  date: string;
  hours: number;
  activity: string;
  project: string;
  note: string;
}
