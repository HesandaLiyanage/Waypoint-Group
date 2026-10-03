import { components } from './types.gen';

export type ProblemDetails = components['schemas']['ProblemDetails'];
export type UserRole = components['schemas']['UserRole'];
export type UserLocale = components['schemas']['UserLocale'];
export type User = components['schemas']['User'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type PinLoginRequest = components['schemas']['PinLoginRequest'];
export type AuthResponse = components['schemas']['AuthResponse'];
export type PatchMeRequest = components['schemas']['PatchMeRequest'];
export type Outlet = components['schemas']['Outlet'];
export type Vehicle = components['schemas']['Vehicle'];
export type CalendarDay = components['schemas']['CalendarDay'];
export type CatalogItem = components['schemas']['CatalogItem'];
export type CreateOrderRequest = components['schemas']['CreateOrderRequest'];
export type Order = components['schemas']['Order'];
export type CreateOrderResponse = components['schemas']['CreateOrderResponse'];
export type StoreScheduleResponse = components['schemas']['StoreScheduleResponse'];
export type ConfirmReceiptRequest = components['schemas']['ConfirmReceiptRequest'];
export type CreateIssueRequest = components['schemas']['CreateIssueRequest'];
export type Issue = components['schemas']['Issue'];
export type Notification = components['schemas']['Notification'];
export type GeneratePlanRequest = components['schemas']['GeneratePlanRequest'];
export type Plan = components['schemas']['Plan'];
export type PlanValidationResult = components['schemas']['PlanValidationResult'];
export type UpdateAssignmentsRequest = components['schemas']['UpdateAssignmentsRequest'];
export type OverrideDeferralRequest = components['schemas']['OverrideDeferralRequest'];
export type OrderExplanation = components['schemas']['OrderExplanation'];
export type DispatchProgress = components['schemas']['DispatchProgress'];
export type SkippedOutlet = components['schemas']['SkippedOutlet'];
export type LoaderTripManifest = components['schemas']['LoaderTripManifest'];
export type BatchLoadCheckRequest = components['schemas']['BatchLoadCheckRequest'];
export type DeviceEvent = components['schemas']['DeviceEvent'];
export type SyncPushRequest = components['schemas']['SyncPushRequest'];
export type SyncPushResponse = components['schemas']['SyncPushResponse'];
export type SyncPullResponse = components['schemas']['SyncPullResponse'];
export type DriverRunSnapshot = components['schemas']['DriverRunSnapshot'];
export type PhotoRecord = components['schemas']['PhotoRecord'];
export type WeeklyForecast = components['schemas']['WeeklyForecast'];

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
      throw new Error(errPayload.detail || errPayload.message || errPayload.title || `HTTP error ${response.status}`);
    }

    return response.json();
  }

  // Health
  async getHealthz(): Promise<{ status?: string }> {
    return this.request('/healthz');
  }

  async getReadyz(): Promise<{ status?: string }> {
    return this.request('/readyz');
  }

  // Auth
  async login(body: LoginRequest): Promise<AuthResponse> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async pinLogin(body: PinLoginRequest): Promise<AuthResponse> {
    return this.request('/auth/pin-login', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getCurrentUser(): Promise<User> {
    return this.request('/me');
  }

  // Reference Data
  async listOutlets(brand?: string, depot?: string): Promise<Outlet[]> {
    const p = new URLSearchParams();
    if (brand) p.append('brand', brand);
    if (depot) p.append('depot', depot);
    const q = p.toString() ? `?${p.toString()}` : '';
    return this.request(`/outlets${q}`);
  }

  async listVehicles(depot?: string): Promise<Vehicle[]> {
    const p = new URLSearchParams();
    if (depot) p.append('depot', depot);
    const q = p.toString() ? `?${p.toString()}` : '';
    return this.request(`/vehicles${q}`);
  }

  async getCalendar(from: string, to: string): Promise<CalendarDay[]> {
    return this.request(`/calendar?from=${from}&to=${to}`);
  }

  async listCatalog(): Promise<CatalogItem[]> {
    return this.request('/catalog');
  }

  // Ordering
  async createOrder(body: CreateOrderRequest, idempotencyKey?: string): Promise<CreateOrderResponse> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    return this.request('/orders', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  async listOrders(params?: { outlet_id?: string; delivery_date?: string; status?: string }): Promise<Order[]> {
    const p = new URLSearchParams();
    if (params?.outlet_id) p.append('outlet_id', params.outlet_id);
    if (params?.delivery_date) p.append('delivery_date', params.delivery_date);
    if (params?.status) p.append('status', params.status);
    const q = p.toString() ? `?${p.toString()}` : '';
    return this.request(`/orders${q}`);
  }

  async getStoreSchedule(outletId: string, date: string): Promise<StoreScheduleResponse> {
    return this.request(`/store/schedule?outlet_id=${outletId}&date=${date}`);
  }

  async confirmReceipt(orderId: string, body: ConfirmReceiptRequest): Promise<{ status: string }> {
    return this.request(`/orders/${orderId}/receipt`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  // Planning & Dispatch
  async generatePlan(body: GeneratePlanRequest): Promise<Plan> {
    return this.request('/plans/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getPlan(id: string): Promise<Plan> {
    return this.request(`/plans/${id}`);
  }

  async validatePlan(id: string): Promise<PlanValidationResult> {
    return this.request(`/plans/${id}/validate`);
  }

  async publishPlan(id: string): Promise<Plan> {
    return this.request(`/plans/${id}/publish`, { method: 'POST' });
  }

  async getDispatchProgress(depot: string, date: string): Promise<DispatchProgress> {
    return this.request(`/dispatch/progress?depot=${depot}&date=${date}`);
  }

  async explainOrderPlacement(orderId: string): Promise<OrderExplanation> {
    return this.request(`/dispatch/explain/${orderId}`);
  }

  // Loader
  async getLoaderManifest(tripId: string): Promise<LoaderTripManifest> {
    return this.request(`/loader/trips/${tripId}/manifest`);
  }

  async submitLoadChecks(tripId: string, body: BatchLoadCheckRequest): Promise<{ status: string }> {
    return this.request(`/loader/trips/${tripId}/checks`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async sealTrip(tripId: string): Promise<{ status: string }> {
    return this.request(`/loader/trips/${tripId}/seal`, { method: 'POST' });
  }

  // Driver & Sync
  async getDriverRun(): Promise<DriverRunSnapshot> {
    return this.request('/driver/run');
  }

  async pushSync(body: SyncPushRequest): Promise<SyncPushResponse> {
    return this.request('/sync/push', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async pullSync(cursor?: string, limit = 100): Promise<SyncPullResponse> {
    const p = new URLSearchParams();
    if (cursor) p.append('since_cursor', cursor);
    if (limit) p.append('limit', limit.toString());
    const q = p.toString() ? `?${p.toString()}` : '';
    return this.request(`/sync/pull${q}`);
  }
}
