export enum UserRole {
  ADMIN = 'ADMIN',
  DISPO = 'DISPO',
  WORKER = 'WORKER',
}

export enum DevicePlatform {
  WEB = 'WEB',
  ANDROID = 'ANDROID',
  IOS = 'IOS',
}

export enum EntryType {
  WORK = 'WORK',
  TRAVEL = 'TRAVEL',
  INTERNAL = 'INTERNAL',
}

export enum EntryStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  LOCKED = 'LOCKED',
}

export enum BreakType {
  DEFAULT = 'DEFAULT',
  LEGAL = 'LEGAL',
  SHORT = 'SHORT',
  OTHER = 'OTHER',
}

export enum CreatedVia {
  WEB = 'WEB',
  MOBILE = 'MOBILE',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  SUBMIT = 'SUBMIT',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REOPEN = 'REOPEN',
  REVOKE_DEVICE = 'REVOKE_DEVICE',
}
