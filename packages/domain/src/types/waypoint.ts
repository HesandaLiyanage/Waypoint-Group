import { UserRole } from './user';

export type WaypointStatus =
  | 'pending'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Waypoint {
  id: string;
  title: string;
  description?: string;
  status: WaypointStatus;
  latitude: number;
  longitude: number;
  assignedTo?: string;
  assignedRole?: UserRole;
  dueAt?: string;
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface EtaPrediction {
  durationMinutes: number;
  distanceKm: number;
  confidenceScore: number;
  estimatedArrival?: string;
}
