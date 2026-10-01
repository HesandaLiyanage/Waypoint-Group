import { z } from 'zod';

export const UserRoleSchema = z.enum([
  'admin',
  'dispatcher',
  'field_agent',
  'driver',
]);

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1),
  role: UserRoleSchema,
  phone: z.string().optional(),
  createdAt: z.string().datetime(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const WaypointStatusSchema = z.enum([
  'pending',
  'assigned',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
]);

export const CoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const CreateWaypointSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  assignedTo: z.string().uuid().optional(),
  assignedRole: UserRoleSchema.optional(),
  dueAt: z.string().datetime().optional(),
});

export const UpdateWaypointStatusSchema = z.object({
  status: WaypointStatusSchema,
  notes: z.string().optional(),
});

export const SyncMutationTypeSchema = z.enum(['CREATE', 'UPDATE', 'DELETE']);

export const SyncEventSchema = z.object({
  eventId: z.string().uuid(),
  entityType: z.enum(['waypoint', 'user', 'note', 'location_ping']),
  entityId: z.string(),
  action: SyncMutationTypeSchema,
  payload: z.record(z.any()),
  clientTimestamp: z.string().datetime(),
  version: z.number().int().nonnegative().default(1),
});

export const SyncPushRequestSchema = z.object({
  clientId: z.string().min(1),
  events: z.array(SyncEventSchema),
});
