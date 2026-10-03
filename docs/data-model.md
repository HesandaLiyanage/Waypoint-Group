# Waypoint Delivery Platform: Data Model & Schema (ERD)

This document provides the authoritative schema documentation and Entity-Relationship Diagram (ERD) for the Waypoint Delivery Platform modular monolith datastore (PostgreSQL 16).

---

## 1. Physical Units & Precision Standard (ADR-008)

All physical capacities and measurements use integer arithmetic or exact `NUMERIC` types to avoid float comparison issues:
- **Mass / Weight**: Integer grams (`total_weight_g`, `weight_cap_kg * 1000`)
- **Volume**: Millilitres-of-m³ / microlitres (`volume_ul` where $1\text{ m}^3 = 1,000,000,000\text{ }\mu\text{L}$, or `volume_mm3` where $1\text{ m}^3 = 1,000,000\text{ mL}$)
- **Fuel**: Millilitres of fuel ($1\text{ L} = 1,000\text{ mL}$)
- **Timestamps**: UTC `timestamptz` with application timezone `Asia/Colombo` (+05:30)

---

## 2. Mermaid Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    OUTLETS ||--o{ ORDERS : "places"
    OUTLETS ||--o{ STOPS : "served_at"
    VEHICLES ||--o{ TRIPS : "assigned_to"
    VEHICLES ||--o{ VEHICLE_AVAILABILITY : "has_status"
    USERS ||--o{ ORDERS : "created_by"
    PLANS ||--o{ TRIPS : "contains"
    PLANS ||--o{ DEFERRALS : "explains"
    TRIPS ||--o{ STOPS : "sequences"
    ORDERS ||--o{ ORDER_LINES : "contains"
    CATALOG_ITEMS ||--o{ ORDER_LINES : "references"
    TRIPS ||--o{ LOAD_CHECKS : "verified_by"
    STOPS ||--o{ RECEIPT_CONFIRMATIONS : "receipted_with"
    ORDERS ||--o{ DISPATCH_ISSUES : "affected_by"
    STOPS ||--o{ DISPATCH_ISSUES : "reported_at"

    OUTLETS {
        string outlet_id PK
        string brand
        string district
        string depot
        string dock_type
        string parking_constraint
        string mall_window
        time window_open_time
        time window_close_time
    }

    VEHICLES {
        string vehicle_id PK
        string type
        string temp
        int weight_cap_kg
        numeric volume_cap_m3
        string fuel_type
        numeric km_per_l
        numeric weekly_fuel_quota_l
        string depot
    }

    VEHICLE_AVAILABILITY {
        string vehicle_id FK
        date date
        string status
    }

    CALENDAR_DAYS {
        date date PK
        int dow
        string dow_name
        boolean is_weekend
        int iso_year
        int iso_week
        boolean is_payday
        string festival
        numeric festival_ramp
        boolean is_holiday
        int monsoon
        int is_operating
    }

    DISTRICT_TRAVEL {
        string district PK
        string depot PK
        string road_class
        int free_flow_kmh
        numeric depot_to_district_km
        int depot_to_district_freeflow_min
        numeric inter_stop_km
        int inter_stop_freeflow_min
    }

    SERVICE_ALLOWANCE {
        string brand PK
        string dock_type PK
        int service_allowance_min
    }

    USERS {
        uuid id PK
        string email UK
        string password_hash
        string pin_hash
        string name
        string role
        string locale
        string depot
        string outlet_id FK
        string vehicle_id FK
        boolean active
        timestamptz created_at
    }

    ORDERS {
        uuid id PK
        string ref UK
        string outlet_id FK
        string brand
        date delivery_date
        string temp_requirement
        string status
        int total_units
        bigint total_weight_g
        bigint total_volume_ul
        timestamptz placed_at
        timestamptz confirmed_at
        boolean is_late
        string source
        int version
        uuid created_by FK
    }

    ORDER_LINES {
        uuid id PK
        uuid order_id FK
        int line_no
        string sku FK
        string name
        int qty
        bigint weight_g
        bigint volume_ul
    }

    PLANS {
        uuid id PK
        date plan_date
        string depot
        int version
        string status
        jsonb validation_violations
        int total_trips
        int total_stops
        numeric total_km
        numeric total_fuel_l
        timestamptz published_at
        timestamptz created_at
    }

    TRIPS {
        uuid id PK
        uuid plan_id FK
        int trip_no
        string vehicle_id FK
        string brand
        string district
        time planned_depart
        int total_trip_min
        int depot_to_district_min
        int inter_stop_min
        int service_allowance_min
        int budget_limit_min
        numeric total_km
        numeric estimated_fuel_l
        string status
    }

    STOPS {
        uuid id PK
        uuid trip_id FK
        int seq
        string outlet_id FK
        uuid order_id FK
        string receipt_code
        string receipt_salt
        string receipt_hash
        string status
        timestamptz eta
        string eta_source
        numeric late_prob
    }

    DEFERRALS {
        uuid id PK
        uuid plan_id FK
        uuid order_id FK
        string reason
        string binding_constraint
        int candidates_evaluated
        jsonb trace
    }

    EVENT_FEED {
        bigint seq PK
        string scope
        string type
        jsonb payload
        timestamptz created_at
    }

    OUTBOX {
        bigint id PK
        string topic
        jsonb payload
        string dedupe_key UK
        timestamptz available_at
        int attempts
        timestamptz created_at
    }

    IDEMPOTENCY_KEYS {
        uuid user_id PK
        string key PK
        string request_hash
        string status
        int response_code
        jsonb response_body
        timestamptz created_at
        timestamptz expires_at
    }
```

---

## 3. Core Database Tables & Indexes

### 3.1 Ordering & Cutoff
- `orders`: Indexed on `(outlet_id, delivery_date)`, `(status, delivery_date)`, `delivery_date`, and unique `ref`.
- Optimistic locking using integer `version` incremented on every status update.
- Fresh split baskets maintain linked provenance while ambient and chilled items travel on separate multi-compartment or dedicated reefer vehicles.

### 3.2 Planning & Execution
- `plans`: Indexed on `(depot, plan_date, version DESC)`.
- `trips`: Indexed on `(plan_id, trip_no)`, `vehicle_id`.
- `stops`: Indexed on `(trip_id, seq)`, `order_id`, `outlet_id`.

### 3.3 Offline Sync & Events
- `device_events`: Client-generated `uuid` as primary key ensures guaranteed server idempotency.
- `event_feed`: Monotonically increasing `BIGSERIAL` sequence (`seq`) driving resumable Server-Sent Events with `Last-Event-ID`.
- `outbox`: High-throughput transactional worker queue utilizing `FOR UPDATE SKIP LOCKED`.
- `idempotency_keys`: Scoped by authenticated `user_id` and SHA-256 request payload hash.
