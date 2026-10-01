import { components } from './types.gen';

export type User = components['schemas']['User'];
export type Waypoint = components['schemas']['Waypoint'];
export type SyncPushRequest = components['schemas']['SyncPushRequest'];
export type SyncPushResponse = components['schemas']['SyncPushResponse'];
export type SyncPullResponse = components['schemas']['SyncPullResponse'];
export type EtaPredictionRequest = components['schemas']['EtaPredictionRequest'];
export type EtaPredictionResponse = components['schemas']['EtaPredictionResponse'];

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
}

export class WaypointApiClient {
  private baseUrl: string;
  private getToken?: () => string | null | Promise<string | null>;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.getToken = config.getToken;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.getToken) {
      const token = await this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errPayload: any;
      try {
        errPayload = await response.json();
      } catch {
        errPayload = { error: response.statusText, message: `HTTP Error ${response.status}` };
      }
      throw new Error(errPayload.message || errPayload.error || `HTTP error ${response.status}`);
    }

    return response.json();
  }

  // Health
  async getHealth(): Promise<components['schemas']['HealthResponse']> {
    return this.request('/health');
  }

  // Auth
  async login(body: components['schemas']['LoginRequest']): Promise<components['schemas']['AuthResponse']> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getCurrentUser(): Promise<User> {
    return this.request('/auth/me');
  }

  // Waypoints
  async listWaypoints(params?: {
    status?: components['schemas']['WaypointStatus'];
    assigned_role?: components['schemas']['UserRole'];
  }): Promise<Waypoint[]> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.append('status', params.status);
    if (params?.assigned_role) searchParams.append('assigned_role', params.assigned_role);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return this.request(`/waypoints${query}`);
  }

  async getWaypoint(id: string): Promise<Waypoint> {
    return this.request(`/waypoints/${id}`);
  }

  async createWaypoint(body: components['schemas']['CreateWaypointRequest']): Promise<Waypoint> {
    return this.request('/waypoints', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async updateWaypointStatus(
    id: string,
    body: components['schemas']['UpdateStatusRequest']
  ): Promise<Waypoint> {
    return this.request(`/waypoints/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  // Sync Push & Pull
  async pushSync(body: SyncPushRequest): Promise<SyncPushResponse> {
    return this.request('/sync/push', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async pullSync(cursor?: string, limit = 100): Promise<SyncPullResponse> {
    const params = new URLSearchParams();
    if (cursor) params.append('since_cursor', cursor);
    if (limit) params.append('limit', limit.toString());
    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/sync/pull${query}`);
  }

  // ML Service
  async predictEta(body: EtaPredictionRequest): Promise<EtaPredictionResponse> {
    return this.request('/ml/eta', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
