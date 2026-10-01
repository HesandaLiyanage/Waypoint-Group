/**
 * This file is generated from contracts/openapi.yaml
 * Do not edit manually.
 */

export interface paths {
  "/health": {
    get: operations["getHealth"];
  };
  "/auth/login": {
    post: operations["login"];
  };
  "/auth/me": {
    get: operations["getCurrentUser"];
  };
  "/waypoints": {
    get: operations["listWaypoints"];
    post: operations["createWaypoint"];
  };
  "/waypoints/{id}": {
    get: operations["getWaypointById"];
  };
  "/waypoints/{id}/status": {
    patch: operations["updateWaypointStatus"];
  };
  "/sync/push": {
    post: operations["pushSyncEvents"];
  };
  "/sync/pull": {
    get: operations["pullSyncEvents"];
  };
  "/ml/eta": {
    post: operations["predictEta"];
  };
}

export interface components {
  schemas: {
    HealthResponse: {
      status: string;
      timestamp: string;
      service: string;
      version: string;
    };
    UserRole: "admin" | "dispatcher" | "field_agent" | "driver";
    User: {
      id: string;
      email: string;
      name: string;
      role: components["schemas"]["UserRole"];
      phone?: string;
      created_at: string;
    };
    LoginRequest: {
      email: string;
      password: string;
    };
    AuthResponse: {
      token: string;
      user: components["schemas"]["User"];
    };
    WaypointStatus: "pending" | "assigned" | "in_progress" | "completed" | "failed" | "cancelled";
    Waypoint: {
      id: string;
      title: string;
      description?: string;
      status: components["schemas"]["WaypointStatus"];
      latitude: number;
      longitude: number;
      assigned_to?: string | null;
      assigned_role?: components["schemas"]["UserRole"] | null;
      due_at?: string | null;
      created_at: string;
      updated_at: string;
    };
    CreateWaypointRequest: {
      title: string;
      description?: string;
      latitude: number;
      longitude: number;
      assigned_to?: string;
      assigned_role?: components["schemas"]["UserRole"];
      due_at?: string;
    };
    UpdateStatusRequest: {
      status: components["schemas"]["WaypointStatus"];
      notes?: string;
    };
    SyncMutationType: "CREATE" | "UPDATE" | "DELETE";
    SyncEvent: {
      event_id: string;
      entity_type: string;
      entity_id: string;
      action: components["schemas"]["SyncMutationType"];
      payload: Record<string, any>;
      client_timestamp: string;
      version?: number;
    };
    SyncPushRequest: {
      client_id: string;
      events: components["schemas"]["SyncEvent"][];
    };
    SyncAck: {
      event_id: string;
      status: "ACK" | "CONFLICT" | "ERROR";
      error_message?: string;
    };
    SyncPushResponse: {
      acks: components["schemas"]["SyncAck"][];
      new_cursor: string;
    };
    SyncPullResponse: {
      events: components["schemas"]["SyncEvent"][];
      next_cursor: string;
      has_more: boolean;
    };
    EtaPredictionRequest: {
      origin_lat: number;
      origin_lng: number;
      destination_lat: number;
      destination_lng: number;
      departure_time?: string;
    };
    EtaPredictionResponse: {
      duration_minutes: number;
      distance_km: number;
      confidence_score: number;
      estimated_arrival?: string;
    };
    ErrorResponse: {
      error: string;
      message: string;
      details?: Record<string, any>;
    };
  };
}

export interface operations {
  getHealth: {
    responses: {
      200: { content: { "application/json": components["schemas"]["HealthResponse"] } };
    };
  };
  login: {
    requestBody: { content: { "application/json": components["schemas"]["LoginRequest"] } };
    responses: {
      200: { content: { "application/json": components["schemas"]["AuthResponse"] } };
      401: { content: { "application/json": components["schemas"]["ErrorResponse"] } };
    };
  };
  getCurrentUser: {
    responses: {
      200: { content: { "application/json": components["schemas"]["User"] } };
    };
  };
  listWaypoints: {
    parameters: {
      query?: {
        status?: components["schemas"]["WaypointStatus"];
        assigned_role?: components["schemas"]["UserRole"];
      };
    };
    responses: {
      200: { content: { "application/json": components["schemas"]["Waypoint"][] } };
    };
  };
  createWaypoint: {
    requestBody: { content: { "application/json": components["schemas"]["CreateWaypointRequest"] } };
    responses: {
      201: { content: { "application/json": components["schemas"]["Waypoint"] } };
    };
  };
  getWaypointById: {
    parameters: { path: { id: string } };
    responses: {
      200: { content: { "application/json": components["schemas"]["Waypoint"] } };
      404: { content: { "application/json": components["schemas"]["ErrorResponse"] } };
    };
  };
  updateWaypointStatus: {
    parameters: { path: { id: string } };
    requestBody: { content: { "application/json": components["schemas"]["UpdateStatusRequest"] } };
    responses: {
      200: { content: { "application/json": components["schemas"]["Waypoint"] } };
    };
  };
  pushSyncEvents: {
    requestBody: { content: { "application/json": components["schemas"]["SyncPushRequest"] } };
    responses: {
      200: { content: { "application/json": components["schemas"]["SyncPushResponse"] } };
    };
  };
  pullSyncEvents: {
    parameters: { query?: { since_cursor?: string; limit?: number } };
    responses: {
      200: { content: { "application/json": components["schemas"]["SyncPullResponse"] } };
    };
  };
  predictEta: {
    requestBody: { content: { "application/json": components["schemas"]["EtaPredictionRequest"] } };
    responses: {
      200: { content: { "application/json": components["schemas"]["EtaPredictionResponse"] } };
    };
  };
}
