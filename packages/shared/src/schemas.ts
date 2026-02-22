import { z } from 'zod';
import { DevicePlatform, EntryType, BreakType, CreatedVia, UserRole } from './enums';

// ── Auth ──────────────────────────────────────────────
export const LoginDto = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});
export type LoginDto = z.infer<typeof LoginDto>;

export const PairDto = z.object({
  token: z.string().min(1),
  deviceName: z.string().min(1).max(100),
  platform: z.nativeEnum(DevicePlatform),
});
export type PairDto = z.infer<typeof PairDto>;

export const RevokeDeviceDto = z.object({
  deviceId: z.string().uuid(),
});
export type RevokeDeviceDto = z.infer<typeof RevokeDeviceDto>;

// ── Users ─────────────────────────────────────────────
export const CreateUserDto = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: z.nativeEnum(UserRole),
});
export type CreateUserDto = z.infer<typeof CreateUserDto>;

export const UpdateUserDto = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserDto = z.infer<typeof UpdateUserDto>;

// ── Customers ─────────────────────────────────────────
export const CreateCustomerDto = z.object({
  name: z.string().min(1).max(200),
  addressLine1: z.string().max(200).nullable().optional(),
  zip: z.string().max(20).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  contactName: z.string().max(200).nullable().optional(),
  contactPhone: z.string().max(50).nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
});
export type CreateCustomerDto = z.infer<typeof CreateCustomerDto>;

export const UpdateCustomerDto = CreateCustomerDto.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateCustomerDto = z.infer<typeof UpdateCustomerDto>;

// ── Projects ──────────────────────────────────────────
export const CreateProjectDto = z.object({
  customerId: z.string().uuid(),
  name: z.string().min(1).max(200),
  siteAddressLine1: z.string().max(200).nullable().optional(),
  siteZip: z.string().max(20).nullable().optional(),
  siteCity: z.string().max(100).nullable().optional(),
  costCenter: z.string().max(50).nullable().optional(),
  hourlyRateCents: z.number().int().min(0).nullable().optional(),
});
export type CreateProjectDto = z.infer<typeof CreateProjectDto>;

export const UpdateProjectDto = CreateProjectDto.omit({ customerId: true }).partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateProjectDto = z.infer<typeof UpdateProjectDto>;

// ── Time Entries ──────────────────────────────────────
export const StartTimeEntryDto = z.object({
  customerId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  entryType: z.nativeEnum(EntryType).default(EntryType.WORK),
  startAt: z.string().datetime().optional(),
  createdVia: z.nativeEnum(CreatedVia),
  rapport: z.string().max(500).nullable().optional(),
});
export type StartTimeEntryDto = z.infer<typeof StartTimeEntryDto>;

export const UpdateRapportDto = z.object({
  rapport: z.string().max(500).nullable(),
});
export type UpdateRapportDto = z.infer<typeof UpdateRapportDto>;

export const StartBreakDto = z.object({
  breakType: z.nativeEnum(BreakType).default(BreakType.DEFAULT),
  startAt: z.string().datetime().optional(),
});
export type StartBreakDto = z.infer<typeof StartBreakDto>;

export const EndBreakDto = z.object({
  endAt: z.string().datetime().optional(),
});
export type EndBreakDto = z.infer<typeof EndBreakDto>;

export const EndTimeEntryDto = z.object({
  endAt: z.string().datetime().optional(),
});
export type EndTimeEntryDto = z.infer<typeof EndTimeEntryDto>;

export const UpdateTimeEntryDto = z.object({
  customerId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  entryType: z.nativeEnum(EntryType).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  rapport: z.string().max(500).nullable().optional(),
});
export type UpdateTimeEntryDto = z.infer<typeof UpdateTimeEntryDto>;

// ── Query filters ─────────────────────────────────────
export const TimeEntryQueryDto = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  userId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
});
export type TimeEntryQueryDto = z.infer<typeof TimeEntryQueryDto>;

export const MonthlyReportQueryDto = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  groupBy: z.enum(['user', 'customer', 'project']).default('user'),
});
export type MonthlyReportQueryDto = z.infer<typeof MonthlyReportQueryDto>;

export const ExportQueryDto = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type ExportQueryDto = z.infer<typeof ExportQueryDto>;

// ── GPS / Location Tracking ───────────────────────────
export const LogLocationDto = z.object({
  lat:         z.number().min(-90).max(90),
  lng:         z.number().min(-180).max(180),
  accuracy:    z.number().min(0).optional(),
  altitude:    z.number().optional(),
  speed:       z.number().min(0).optional(),
  capturedAt:  z.string().datetime().optional(), // ISO, default: now
  timeEntryId: z.string().uuid().optional(),
});
export type LogLocationDto = z.infer<typeof LogLocationDto>;

export const LocationQueryDto = z.object({
  userId:      z.string().uuid().optional(),
  timeEntryId: z.string().uuid().optional(),
  from:        z.string().datetime().optional(),
  to:          z.string().datetime().optional(),
  limit:       z.coerce.number().int().min(1).max(1000).default(200),
});
export type LocationQueryDto = z.infer<typeof LocationQueryDto>;
