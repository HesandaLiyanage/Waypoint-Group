export interface paths {
    "/healthz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Liveness check */
        get: operations["getHealthz"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/readyz": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Readiness check (DB connectivity & migrations) */
        get: operations["getReadyz"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Authenticate with email and password */
        post: operations["authLogin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/pin-login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** PIN authentication for shared depot terminals */
        post: operations["authPinLogin"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Rotate refresh token and obtain new access token */
        post: operations["authRefresh"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke refresh token family */
        post: operations["authLogout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get current authenticated user profile */
        get: operations["getMe"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update current user preferences (locale) */
        patch: operations["patchMe"];
        trace?: never;
    };
    "/outlets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List outlets */
        get: operations["listOutlets"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/vehicles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List vehicles */
        get: operations["listVehicles"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/calendar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get operating calendar days */
        get: operations["getCalendar"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List catalog items */
        get: operations["listCatalog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List orders */
        get: operations["listOrders"];
        put?: never;
        /** Place order for outlet */
        post: operations["createOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get order by ID */
        get: operations["getOrder"];
        put?: never;
        post?: never;
        /** Cancel order before cutoff */
        delete: operations["cancelOrder"];
        options?: never;
        head?: never;
        /** Edit order before cutoff */
        patch: operations["updateOrder"];
        trace?: never;
    };
    "/store/schedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Expected arrival schedule and receipt codes for store */
        get: operations["getStoreSchedule"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/stops/{id}/receipt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirm delivery receipt at store */
        post: operations["confirmReceipt"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/issues": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Report operational issue */
        post: operations["createIssue"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List user notifications */
        get: operations["listNotifications"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/notifications/{id}/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Mark notification as read */
        post: operations["markNotificationRead"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dispatch/queue": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get confirmed and carried-over orders queue */
        get: operations["getDispatchQueue"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dispatch/close-orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Manually trigger cutoff closing for depot and date */
        post: operations["closeOrdersCutoff"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/plans/generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Auto-generate optimized delivery plan */
        post: operations["generatePlan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/plans/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get plan details */
        get: operations["getPlan"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/plans/{id}/assignments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Manually edit trip assignments */
        put: operations["updatePlanAssignments"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/plans/{id}/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Validate plan feasibility with pure rule validator */
        post: operations["validatePlan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/plans/{id}/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Publish plan atomically (locks, fuel reservation, seal/supersede) */
        post: operations["publishPlan"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/plans/{id}/deferrals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List deferrals with reasons and explanations */
        get: operations["getPlanDeferrals"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/plans/{id}/deferrals/{order_id}/override": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Override deferral and force assign order */
        post: operations["overrideDeferral"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/plans/{id}/orders/{order_id}/explain": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Explain placement or deferral decision for an order */
        get: operations["explainOrderPlacement"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dispatch/progress": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Live progress of trips and deliveries */
        get: operations["getDispatchProgress"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dispatch/skipped-outlets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List outlets skipped in previous planning cycles */
        get: operations["getSkippedOutlets"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/dispatch/issues": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List operational issues for dispatcher */
        get: operations["listDispatchIssues"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/issues/{id}/ack": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Acknowledge an issue */
        post: operations["ackIssue"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/issues/{id}/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Resolve an issue */
        post: operations["resolveIssue"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/forecast/weekly": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Weekly volume and trip capacity forecast */
        get: operations["getWeeklyForecast"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/loader/trips": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List trips assigned to depot for loading */
        get: operations["listLoaderTrips"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/loader/trips/{id}/manifest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get trip manifest with reverse-load sequence */
        get: operations["getLoaderManifest"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/loader/trips/{id}/checks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Submit batch loading checks (ok, short, damaged) */
        post: operations["submitLoadChecks"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/loader/trips/{id}/ack-changes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Acknowledge plan changes made after loading began */
        post: operations["ackTripChanges"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/loader/trips/{id}/seal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Seal loaded vehicle trip before departure */
        post: operations["sealTrip"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/driver/run": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get full offline-capable daily run snapshot for driver */
        get: operations["getDriverRun"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sync/push": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Batch push offline device delivery events */
        post: operations["syncPush"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/sync/pull": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Delta pull server state changes */
        get: operations["syncPull"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/photos/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /** Upload delivery or damage verification photo */
        put: operations["uploadPhoto"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/events/stream": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Real-time Server-Sent Events stream */
        get: operations["streamEvents"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/demo/reset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reset database and re-seed deterministic demo day */
        post: operations["resetDemo"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/demo/clock": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Set simulated demo time */
        post: operations["setDemoClock"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/admin/demo/advance": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Advance simulated demo time by minutes */
        post: operations["advanceDemoClock"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        ProblemDetails: {
            /** @example https://waypoint.lk/errors/validation-failed */
            type: string;
            /** @example Validation Failed */
            title: string;
            /** @example 422 */
            status: number;
            /** @example CAPACITY_VOLUME */
            code: string;
            /** @example req-01h8abc123 */
            request_id: string;
            /** @example Order volume exceeds available vehicle volume capacity */
            detail?: string;
            /**
             * @example {
             *       "needed_m3": 3.2,
             *       "free_m3": 1.1,
             *       "vehicle_id": "VEH003"
             *     }
             */
            params?: {
                [key: string]: unknown;
            };
        };
        /** @enum {string} */
        UserRole: "dispatcher" | "loader" | "driver" | "store_manager";
        /** @enum {string} */
        UserLocale: "en" | "si" | "ta";
        User: {
            /** Format: uuid */
            id: string;
            name: string;
            /** Format: email */
            email: string;
            role: components["schemas"]["UserRole"];
            /** @example Peliyagoda */
            depot?: string | null;
            /** @example OUT001 */
            outlet_id?: string | null;
            /** @example VEH001 */
            vehicle_id?: string | null;
            locale: components["schemas"]["UserLocale"];
            active: boolean;
            /** Format: date-time */
            created_at: string;
        };
        LoginRequest: {
            /** Format: email */
            email: string;
            password: string;
        };
        PinLoginRequest: {
            /** @example 1234 */
            pin: string;
            /**
             * @description User email, user ID, or depot name for shared terminal
             * @example loader@waypoint.local
             */
            identifier?: string;
        };
        AuthResponse: {
            access_token: string;
            /** @example Bearer */
            token_type: string;
            /** @example 900 */
            expires_in: number;
            user: components["schemas"]["User"];
        };
        PatchMeRequest: {
            locale?: components["schemas"]["UserLocale"];
        };
        Outlet: {
            /** @example OUT001 */
            outlet_id: string;
            /** @enum {string} */
            brand: "Fresh" | "Style" | "Tech";
            /** @example Colombo */
            district: string;
            /** @enum {string} */
            depot: "Peliyagoda" | "Kandy";
            /** @enum {string} */
            dock_type: "rear_dock" | "street" | "mall_bay";
            /** @enum {string} */
            parking_constraint: "normal" | "van_only" | "mall_dock";
            /** @example 06:00-08:00 */
            mall_window?: string | null;
            /** @example 04:00:00 */
            window_open_time: string;
            /** @example 08:00:00 */
            window_close_time: string;
        };
        Vehicle: {
            /** @example VEH001 */
            vehicle_id: string;
            /** @enum {string} */
            type: "truck" | "van";
            /** @enum {string} */
            temp: "reefer" | "ambient";
            /** @example 3500 */
            weight_cap_kg: number;
            /**
             * Format: double
             * @example 18.5
             */
            volume_cap_m3: number;
            /** @example diesel */
            fuel_type: string;
            /**
             * Format: double
             * @example 4.5
             */
            km_per_l: number;
            /**
             * Format: double
             * @example 150
             */
            weekly_fuel_quota_l: number;
            /** @enum {string} */
            depot: "Peliyagoda" | "Kandy";
            /**
             * @example available
             * @enum {string}
             */
            status?: "available" | "in_workshop";
        };
        CalendarDay: {
            /**
             * Format: date
             * @example 2026-10-05
             */
            date: string;
            /** @example 0 */
            dow: number;
            /** @example Monday */
            dow_name: string;
            /** @example 0 */
            is_weekend: number;
            /** @example 2026 */
            iso_year: number;
            /** @example 41 */
            iso_week: number;
            /** @example 0 */
            is_payday: number;
            /** @example Deepavali */
            festival: string;
            /**
             * Format: double
             * @example 0.8
             */
            festival_ramp: number;
            /** @example 0 */
            is_holiday: number;
            /** @example 1 */
            monsoon: number;
            /** @example 1 */
            is_operating: number;
        };
        CatalogItem: {
            /** @example SKU-FRESH-MILK-1L */
            sku: string;
            /** @enum {string} */
            brand: "Fresh" | "Style" | "Tech";
            /** @example Fresh Full Cream Milk 1L */
            name_en: string;
            /** @example නැවුම් එළකිරි 1L */
            name_si: string;
            /** @example புதிய பால் 1L */
            name_ta: string;
            /**
             * Format: double
             * @example 1.05
             */
            unit_weight_kg: number;
            /**
             * Format: double
             * @example 0.0012
             */
            unit_volume_m3: number;
            /** @enum {string} */
            temp_requirement: "ambient" | "chilled";
        };
        OrderItemInput: {
            sku: string;
            qty: number;
        };
        CreateOrderRequest: {
            /**
             * Format: uuid
             * @description Client-generated UUIDv7 for idempotent submit
             */
            id: string;
            /** @example OUT001 */
            outlet_id: string;
            /**
             * Format: date
             * @example 2026-10-05
             */
            delivery_date: string;
            items: components["schemas"]["OrderItemInput"][];
            /**
             * @default app
             * @enum {string}
             */
            source: "app" | "phone_entry";
        };
        OrderLine: {
            line_no: number;
            sku: string;
            name: string;
            qty: number;
            /** Format: int64 */
            weight_g: number;
            /** Format: int64 */
            volume_ul: number;
            /** @enum {string} */
            temp_requirement: "ambient" | "chilled";
        };
        /** @enum {string} */
        OrderStatus: "submitted" | "queued" | "planned" | "loading" | "on_route" | "delivered" | "delivered_short" | "failed" | "deferred" | "cancelled";
        Order: {
            /** Format: uuid */
            id: string;
            /** @example ORD-20261005-001 */
            ref: string;
            outlet_id: string;
            /** @enum {string} */
            brand: "Fresh" | "Style" | "Tech";
            /** Format: date */
            delivery_date: string;
            /** @enum {string} */
            temp_requirement: "ambient" | "chilled";
            status: components["schemas"]["OrderStatus"];
            total_units: number;
            /** Format: int64 */
            total_weight_g: number;
            /** Format: int64 */
            total_volume_ul: number;
            /** Format: date-time */
            placed_at: string;
            /** Format: date-time */
            confirmed_at?: string | null;
            is_late: boolean;
            source: string;
            version: number;
            /** Format: uuid */
            created_by: string;
            lines?: components["schemas"]["OrderLine"][];
        };
        CreateOrderResponse: {
            /** @description Created orders (1 order normally, or 2 orders if split across ambient and chilled) */
            orders: components["schemas"]["Order"][];
        };
        UpdateOrderRequest: {
            items: components["schemas"]["OrderItemInput"][];
        };
        StoreScheduleStop: {
            /** Format: uuid */
            order_id: string;
            order_ref: string;
            status: components["schemas"]["OrderStatus"];
            /** @enum {string|null} */
            trip_status?: "planned" | "loading" | "sealed" | "departed" | "completed" | "aborted" | null;
            /** Format: date-time */
            eta?: string | null;
            /** @example 15 */
            eta_buffer_min?: number | null;
            /** @enum {string|null} */
            eta_source?: "rule" | "model" | null;
            /** @example 04:00:00 */
            window_open: string;
            /** @example 08:00:00 */
            window_close: string;
            /**
             * @description Displayed to store manager for offline PoD verification
             * @example 482913
             */
            receipt_code?: string | null;
            deferral_notice?: {
                reason_code?: string;
                /** Format: date */
                carried_to?: string;
            } | null;
        };
        StoreScheduleResponse: {
            /** Format: date */
            date: string;
            outlet_id: string;
            stops: components["schemas"]["StoreScheduleStop"][];
        };
        ConfirmReceiptRequest: {
            /** @example 482913 */
            code: string;
            /** @enum {string} */
            status: "ok" | "short" | "damaged" | "disputed";
            note?: string | null;
            lines: {
                line_no: number;
                qty_received: number;
                /** @enum {string} */
                status: "ok" | "short" | "damaged";
            }[];
        };
        CreateIssueRequest: {
            /** @enum {string} */
            kind: "MISSING_GOODS" | "DAMAGED_GOODS" | "ACCESS_BLOCKED" | "LATE_ARRIVAL" | "VEHICLE_BREAKDOWN" | "OTHER";
            /** Format: uuid */
            order_id?: string | null;
            /** Format: uuid */
            trip_id?: string | null;
            /** Format: uuid */
            stop_id?: string | null;
            detail: {
                [key: string]: unknown;
            };
        };
        Issue: {
            /** Format: uuid */
            id: string;
            kind: string;
            /** Format: uuid */
            order_id?: string | null;
            /** Format: uuid */
            trip_id?: string | null;
            /** Format: uuid */
            stop_id?: string | null;
            /** Format: uuid */
            raised_by: string;
            raised_role: components["schemas"]["UserRole"];
            /** @enum {string} */
            status: "open" | "ack" | "resolved";
            detail: {
                [key: string]: unknown;
            };
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            resolved_at?: string | null;
        };
        Notification: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            user_id: string;
            /** @example DEFERRAL_NOTICE */
            kind: string;
            params: {
                [key: string]: unknown;
            };
            /** Format: date-time */
            read_at?: string | null;
            /** Format: date-time */
            created_at: string;
        };
        GeneratePlanRequest: {
            /** @enum {string} */
            depot: "Peliyagoda" | "Kandy";
            /** Format: date */
            plan_date: string;
            /**
             * @default fairness_first
             * @enum {string}
             */
            strategy: "fairness_first" | "max_served";
        };
        /** @enum {string} */
        PlanStatus: "draft" | "published" | "superseded";
        /** @enum {string} */
        TripStatus: "planned" | "loading" | "sealed" | "departed" | "completed" | "aborted";
        /** @enum {string} */
        StopStatus: "pending" | "arrived" | "delivered" | "delivered_short" | "failed" | "receipt_confirmed" | "receipt_disputed";
        TripStop: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            plan_id: string;
            /** Format: uuid */
            trip_id: string;
            /** Format: uuid */
            order_id: string;
            order_ref: string;
            outlet_id: string;
            brand: string;
            seq: number;
            /** Format: date-time */
            eta?: string | null;
            /** @enum {string|null} */
            eta_source?: "rule" | "model" | null;
            /** @example 04:00:00 */
            window_open: string;
            /** @example 08:00:00 */
            window_close: string;
            /** Format: float */
            late_risk?: number | null;
            status: components["schemas"]["StopStatus"];
            /** @default false */
            changed_after_loading: boolean;
            order_lines?: components["schemas"]["OrderLine"][];
        };
        Trip: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            plan_id: string;
            vehicle_id: string;
            /** @enum {string} */
            vehicle_type?: "truck" | "van";
            /** @enum {string} */
            vehicle_temp?: "reefer" | "ambient";
            /** @enum {integer} */
            trip_no: 1 | 2;
            /** @enum {string} */
            brand: "Fresh" | "Style" | "Tech";
            district: string;
            status: components["schemas"]["TripStatus"];
            /** Format: date-time */
            planned_depart: string;
            minutes: {
                depot_to_district_min: number;
                inter_stop_min: number;
                service_allowance_min: number;
                total_trip_min: number;
                budget_limit_min: number;
            };
            /** Format: double */
            est_km: number;
            /** Format: int64 */
            est_fuel_ml: number;
            /** Format: int64 */
            loaded_weight_g: number;
            /** Format: int64 */
            loaded_volume_ul: number;
            /** Format: double */
            weight_utilization_pct?: number;
            /** Format: double */
            volume_utilization_pct?: number;
            /** @default false */
            changed_after_loading: boolean;
            stops: components["schemas"]["TripStop"][];
        };
        Deferral: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            plan_id: string;
            /** Format: uuid */
            order_id: string;
            order_ref: string;
            outlet_id: string;
            brand: string;
            /** @enum {string} */
            reason_code: "CAPACITY_VOLUME" | "CAPACITY_WEIGHT" | "NO_REEFER_AVAILABLE" | "VAN_ONLY_NO_VAN" | "FUEL_QUOTA" | "TIME_BUDGET" | "WINDOW_INFEASIBLE" | "NO_VEHICLE_AT_DEPOT" | "LATE_ORDER" | "MANUAL";
            reason_params: {
                [key: string]: unknown;
            };
            explanation: {
                [key: string]: unknown;
            };
            decided_by: string;
            /** Format: date */
            carried_to: string;
            /** Format: date-time */
            created_at: string;
        };
        PlanSummary: {
            total_orders: number;
            served_orders: number;
            deferred_orders: number;
            total_trips: number;
            active_vehicles: number;
            /**
             * @example [
             *       "reefer volume 98% used; 14 chilled orders deferred"
             *     ]
             */
            limiting_resources: string[];
            depot_utilization?: {
                [key: string]: unknown;
            };
        };
        Plan: {
            /** Format: uuid */
            id: string;
            /** @enum {string} */
            depot: "Peliyagoda" | "Kandy";
            /** Format: date */
            plan_date: string;
            version: number;
            status: components["schemas"]["PlanStatus"];
            /** @enum {string} */
            strategy: "fairness_first" | "max_served";
            summary: components["schemas"]["PlanSummary"];
            trips: components["schemas"]["Trip"][];
            deferrals: components["schemas"]["Deferral"][];
            /** Format: uuid */
            created_by: string;
            /** Format: date-time */
            published_at?: string | null;
        };
        PlanViolation: {
            /** @enum {string} */
            severity: "hard" | "soft" | "warning";
            /** @enum {string} */
            code: "CAP_VOLUME" | "CAP_WEIGHT" | "NEED_REEFER" | "VAN_ONLY" | "DEPOT_MISMATCH" | "MIXED_BRAND_DISTRICT" | "MAX_TRIPS" | "BUDGET_FRESH" | "BUDGET_STYLETECH" | "FUEL_QUOTA" | "WINDOW_LATE" | "MALL_WINDOW" | "VEHICLE_UNAVAILABLE" | "ORDER_SPLIT" | "UNKNOWN";
            message: string;
            /** Format: uuid */
            trip_id?: string | null;
            /** Format: uuid */
            order_id?: string | null;
            vehicle_id?: string | null;
            params?: {
                [key: string]: unknown;
            };
        };
        PlanValidationResult: {
            is_valid: boolean;
            hard_violations_count: number;
            violations: components["schemas"]["PlanViolation"][];
        };
        UpdateAssignmentsRequest: {
            assignments: {
                /** Format: uuid */
                order_id: string;
                /** @enum {string} */
                action: "assign" | "defer";
                /** Format: uuid */
                trip_id?: string | null;
                seq?: number | null;
                override_reason?: string | null;
            }[];
        };
        OverrideDeferralRequest: {
            /** Format: uuid */
            trip_id: string;
            seq?: number | null;
            reason_code: string;
            reason_note?: string | null;
        };
        OrderExplanation: {
            /** Format: uuid */
            order_id: string;
            order_ref: string;
            /** @enum {string} */
            status: "served" | "deferred";
            /** Format: uuid */
            assigned_trip_id?: string | null;
            binding_constraint?: string | null;
            candidates_evaluated?: number;
            trace: {
                [key: string]: unknown;
            }[];
        };
        DispatchProgress: {
            depot: string;
            /** Format: date */
            date: string;
            total_trips: number;
            departed_trips: number;
            completed_trips: number;
            total_stops: number;
            delivered_stops: number;
            failed_stops?: number;
            /** Format: double */
            completion_pct: number;
            trips?: {
                /** Format: uuid */
                trip_id?: string;
                vehicle_id?: string;
                trip_no?: number;
                status?: components["schemas"]["TripStatus"];
                delivered_count?: number;
                total_count?: number;
            }[];
        };
        SkippedOutlet: {
            outlet_id: string;
            brand: string;
            district: string;
            /** Format: date */
            last_served_date?: string | null;
            skip_streak: number;
        };
        LoaderManifestStop: {
            /** Format: uuid */
            stop_id: string;
            /** @description Delivery stop sequence (1, 2, 3...) */
            stop_seq: number;
            /** @description Physical dock load sequence (last delivered stop is loaded first) */
            reverse_load_seq: number;
            outlet_id: string;
            brand: string;
            dock_type: string;
            lines: components["schemas"]["OrderLine"][];
        };
        LoaderTripManifest: {
            /** Format: uuid */
            trip_id: string;
            /** Format: uuid */
            plan_id: string;
            plan_version: number;
            vehicle_id: string;
            trip_no: number;
            status: components["schemas"]["TripStatus"];
            changed_after_loading: boolean;
            reverse_load_stops: components["schemas"]["LoaderManifestStop"][];
        };
        BatchLoadCheckRequest: {
            checks: {
                /** Format: uuid */
                stop_id: string;
                line_no: number;
                /** @enum {string} */
                status: "ok" | "short" | "damaged";
                /** @default 0 */
                qty_short: number;
                note?: string | null;
                /** Format: uuid */
                photo_id?: string | null;
                /** Format: uuid */
                client_event_id: string;
            }[];
        };
        DeviceEvent: {
            /** Format: uuid */
            event_id: string;
            device_id: string;
            /** Format: int64 */
            device_seq: number;
            /** @enum {string} */
            type: "TRIP_DEPARTED" | "STOP_ARRIVED" | "STOP_DELIVERED" | "STOP_FAILED" | "ISSUE_REPORTED" | "TRIP_COMPLETED";
            /** Format: uuid */
            stop_id?: string | null;
            plan_version_seen?: number | null;
            /** Format: date-time */
            client_ts: string;
            payload: {
                [key: string]: unknown;
            };
        };
        SyncPushRequest: {
            events: components["schemas"]["DeviceEvent"][];
        };
        SyncEventAck: {
            /** Format: uuid */
            event_id: string;
            /** @enum {string} */
            result: "accepted" | "duplicate" | "rejected";
            reject_code?: string | null;
            /** Format: date-time */
            server_ts: string;
            /** @default false */
            conflict: boolean;
            entity_versions?: {
                [key: string]: unknown;
            };
        };
        SyncPushResponse: {
            acks: components["schemas"]["SyncEventAck"][];
        };
        SyncPullResponse: {
            next_cursor: string;
            changes: {
                /** @enum {string} */
                entity: "plan" | "trip" | "stop" | "order" | "notification";
                id: string;
                version: number;
                /** @enum {string} */
                action: "upsert" | "delete";
                payload: {
                    [key: string]: unknown;
                };
            }[];
        };
        DriverRunSnapshot: {
            /** Format: date */
            date: string;
            depot: string;
            vehicle_id: string;
            /** Format: uuid */
            plan_id: string;
            plan_version: number;
            trips: {
                /** Format: uuid */
                trip_id: string;
                trip_no: number;
                status: components["schemas"]["TripStatus"];
                stops: {
                    /** Format: uuid */
                    stop_id: string;
                    seq: number;
                    outlet_id: string;
                    brand: string;
                    district: string;
                    dock_type?: string;
                    parking_constraint?: string;
                    window_open: string;
                    window_close: string;
                    /** Format: date-time */
                    eta?: string | null;
                    receipt_salt: string;
                    receipt_hash: string;
                    status: components["schemas"]["StopStatus"];
                    contact_phone?: string | null;
                    lines: components["schemas"]["OrderLine"][];
                }[];
            }[];
        };
        PhotoRecord: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            stop_id?: string | null;
            /** @enum {string} */
            kind: "pod" | "damage" | "dock_issue";
            content_type: string;
            bytes: number;
            sha256: string;
            /** Format: uuid */
            uploaded_by: string;
            /** Format: date-time */
            created_at: string;
        };
        WeeklyForecast: {
            depot: string;
            iso_year: number;
            iso_week: number;
            estimated_reefer_trips: number;
            estimated_dry_trips: number;
            brand_forecasts: {
                brand: string;
                /** Format: double */
                total_volume_m3: number;
                /** Format: double */
                total_weight_kg: number;
            }[];
        };
    };
    responses: never;
    parameters: {
        /** @description Unique client-generated key guaranteeing idempotent execution. */
        IdempotencyKeyHeader: string;
        /** @description Entity tag / version for optimistic concurrency control. */
        IfMatchHeader: string;
        /** @description Monotonic sequence ID for SSE stream replay. */
        LastEventIDHeader: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getHealthz: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Service is alive */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example ok */
                        status?: string;
                    };
                };
            };
        };
    };
    getReadyz: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Service is ready */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example ok */
                        status?: string;
                        /** @example connected */
                        db?: string;
                    };
                };
            };
            /** @description Service not ready */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    authLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Successfully authenticated */
            200: {
                headers: {
                    "Set-Cookie"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponse"];
                };
            };
            /** @description Invalid credentials */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    authPinLogin: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PinLoginRequest"];
            };
        };
        responses: {
            /** @description Successfully authenticated via PIN */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponse"];
                };
            };
            /** @description Invalid PIN or identifier */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    authRefresh: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Token refreshed */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AuthResponse"];
                };
            };
            /** @description Invalid or expired refresh token */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    authLogout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Logged out successfully */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current user profile */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
        };
    };
    patchMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PatchMeRequest"];
            };
        };
        responses: {
            /** @description Updated profile */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["User"];
                };
            };
        };
    };
    listOutlets: {
        parameters: {
            query?: {
                depot?: string;
                brand?: string;
                district?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Outlets list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Outlet"][];
                };
            };
        };
    };
    listVehicles: {
        parameters: {
            query?: {
                depot?: string;
                type?: string;
                temp?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Vehicles list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Vehicle"][];
                };
            };
        };
    };
    getCalendar: {
        parameters: {
            query: {
                from: string;
                to: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Calendar days */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CalendarDay"][];
                };
            };
        };
    };
    listCatalog: {
        parameters: {
            query?: {
                brand?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Catalog items */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogItem"][];
                };
            };
        };
    };
    listOrders: {
        parameters: {
            query?: {
                outlet_id?: string;
                date?: string;
                cursor?: string;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Orders list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        orders: components["schemas"]["Order"][];
                        next_cursor?: string | null;
                    };
                };
            };
        };
    };
    createOrder: {
        parameters: {
            query?: never;
            header?: {
                /** @description Unique client-generated key guaranteeing idempotent execution. */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKeyHeader"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateOrderRequest"];
            };
        };
        responses: {
            /** @description Order created (split into 2 orders if Fresh mixed temp) */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CreateOrderResponse"];
                };
            };
            /** @description Invalid request or non-operating date */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
            /** @description Order validation error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    getOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Order details */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
            /** @description Order not found */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    cancelOrder: {
        parameters: {
            query?: never;
            header?: {
                /** @description Entity tag / version for optimistic concurrency control. */
                "If-Match"?: components["parameters"]["IfMatchHeader"];
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Order cancelled */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Order locked after cutoff or version conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    updateOrder: {
        parameters: {
            query?: never;
            header?: {
                /** @description Entity tag / version for optimistic concurrency control. */
                "If-Match"?: components["parameters"]["IfMatchHeader"];
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateOrderRequest"];
            };
        };
        responses: {
            /** @description Order updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
            /** @description Order locked after cutoff or version conflict */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    getStoreSchedule: {
        parameters: {
            query: {
                outlet_id?: string;
                date: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Store delivery schedule */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["StoreScheduleResponse"];
                };
            };
        };
    };
    confirmReceipt: {
        parameters: {
            query?: never;
            header?: {
                /** @description Unique client-generated key guaranteeing idempotent execution. */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKeyHeader"];
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ConfirmReceiptRequest"];
            };
        };
        responses: {
            /** @description Receipt confirmed */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        stop_id?: string;
                        status?: string;
                        /** Format: date-time */
                        confirmed_at?: string;
                    };
                };
            };
            /** @description Invalid receipt code or validation error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    createIssue: {
        parameters: {
            query?: never;
            header?: {
                /** @description Unique client-generated key guaranteeing idempotent execution. */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKeyHeader"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CreateIssueRequest"];
            };
        };
        responses: {
            /** @description Issue created */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Issue"];
                };
            };
        };
    };
    listNotifications: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description User notifications */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Notification"][];
                };
            };
        };
    };
    markNotificationRead: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Notification marked as read */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    getDispatchQueue: {
        parameters: {
            query: {
                depot: string;
                date: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Queue of orders ready for planning */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        depot: string;
                        /** Format: date */
                        date: string;
                        total_orders: number;
                        orders: components["schemas"]["Order"][];
                    };
                };
            };
        };
    };
    closeOrdersCutoff: {
        parameters: {
            query?: never;
            header?: {
                /** @description Unique client-generated key guaranteeing idempotent execution. */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKeyHeader"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    depot: string;
                    /** Format: date */
                    date: string;
                };
            };
        };
        responses: {
            /** @description Cutoff executed */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        depot?: string;
                        /** Format: date */
                        date?: string;
                        closed_orders_count?: number;
                        late_orders_count?: number;
                    };
                };
            };
        };
    };
    generatePlan: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GeneratePlanRequest"];
            };
        };
        responses: {
            /** @description Draft plan generated */
            201: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Plan"];
                };
            };
            /** @description Generation error (e.g. non-operating date) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    getPlan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Plan details */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Plan"];
                };
            };
        };
    };
    updatePlanAssignments: {
        parameters: {
            query?: never;
            header?: {
                /** @description Entity tag / version for optimistic concurrency control. */
                "If-Match"?: components["parameters"]["IfMatchHeader"];
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateAssignmentsRequest"];
            };
        };
        responses: {
            /** @description Assignments updated */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        plan: components["schemas"]["Plan"];
                        validation: components["schemas"]["PlanValidationResult"];
                    };
                };
            };
            /** @description Plan version conflict or already departed */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    validatePlan: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Validation result */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PlanValidationResult"];
                };
            };
        };
    };
    publishPlan: {
        parameters: {
            query?: never;
            header?: {
                /** @description Unique client-generated key guaranteeing idempotent execution. */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKeyHeader"];
                /** @description Entity tag / version for optimistic concurrency control. */
                "If-Match"?: components["parameters"]["IfMatchHeader"];
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Plan published */
            200: {
                headers: {
                    ETag?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Plan"];
                };
            };
            /** @description Plan has hard feasibility violations */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    getPlanDeferrals: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description List of deferrals */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Deferral"][];
                };
            };
        };
    };
    overrideDeferral: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                order_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OverrideDeferralRequest"];
            };
        };
        responses: {
            /** @description Override applied */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Plan"];
                };
            };
        };
    };
    explainOrderPlacement: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                order_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Placement explanation trace */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderExplanation"];
                };
            };
        };
    };
    getDispatchProgress: {
        parameters: {
            query: {
                depot: string;
                date: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Progress statistics */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DispatchProgress"];
                };
            };
        };
    };
    getSkippedOutlets: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Outlets with skip streaks */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SkippedOutlet"][];
                };
            };
        };
    };
    listDispatchIssues: {
        parameters: {
            query?: {
                status?: "open" | "ack" | "resolved";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Issues list */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Issue"][];
                };
            };
        };
    };
    ackIssue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Issue acknowledged */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Issue"];
                };
            };
        };
    };
    resolveIssue: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Issue resolved */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Issue"];
                };
            };
        };
    };
    getWeeklyForecast: {
        parameters: {
            query: {
                depot: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Weekly forecast */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["WeeklyForecast"];
                };
            };
        };
    };
    listLoaderTrips: {
        parameters: {
            query: {
                depot: string;
                date: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trips list for loading */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Trip"][];
                };
            };
        };
    };
    getLoaderManifest: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Manifest with reverse loading order */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LoaderTripManifest"];
                };
            };
        };
    };
    submitLoadChecks: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BatchLoadCheckRequest"];
            };
        };
        responses: {
            /** @description Checks recorded */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        recorded_count?: number;
                    };
                };
            };
        };
    };
    ackTripChanges: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Changes acknowledged */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example acknowledged */
                        status?: string;
                    };
                };
            };
        };
    };
    sealTrip: {
        parameters: {
            query?: never;
            header?: {
                /** @description Unique client-generated key guaranteeing idempotent execution. */
                "Idempotency-Key"?: components["parameters"]["IdempotencyKeyHeader"];
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trip sealed */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        trip_id?: string;
                        /** @example sealed */
                        status?: string;
                    };
                };
            };
        };
    };
    getDriverRun: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Driver run snapshot with all trips and stops */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DriverRunSnapshot"];
                };
            };
        };
    };
    syncPush: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SyncPushRequest"];
            };
        };
        responses: {
            /** @description Per-event acknowledgements */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SyncPushResponse"];
                };
            };
            /** @description Rate limited with Retry-After header */
            429: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    syncPull: {
        parameters: {
            query?: {
                cursor?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description State changes with next cursor */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SyncPullResponse"];
                };
            };
        };
    };
    uploadPhoto: {
        parameters: {
            query?: {
                kind?: "pod" | "damage" | "dock_issue";
                stop_id?: string;
            };
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "image/*": string;
            };
        };
        responses: {
            /** @description Photo uploaded successfully */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PhotoRecord"];
                };
            };
            /** @description Payload too large (> 2 MB) */
            413: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/problem+json": components["schemas"]["ProblemDetails"];
                };
            };
        };
    };
    streamEvents: {
        parameters: {
            query?: never;
            header?: {
                /** @description Monotonic sequence ID for SSE stream replay. */
                "Last-Event-ID"?: components["parameters"]["LastEventIDHeader"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description SSE event stream */
            200: {
                headers: {
                    "Content-Type"?: string;
                    "Cache-Control"?: string;
                    Connection?: string;
                    "X-Accel-Buffering"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": string;
                };
            };
        };
    };
    resetDemo: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Demo environment reset */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @example reset_completed */
                        status?: string;
                        /** @example 2026-10-05 */
                        demo_date?: string;
                    };
                };
            };
        };
    };
    setDemoClock: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /**
                     * Format: date-time
                     * @example 2026-10-05T15:55:00+05:30
                     */
                    simulated_now: string;
                };
            };
        };
        responses: {
            /** @description Simulated clock updated */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: date-time */
                        simulated_now?: string;
                    };
                };
            };
        };
    };
    advanceDemoClock: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @example 15 */
                    minutes: number;
                };
            };
        };
        responses: {
            /** @description Simulated clock advanced */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: date-time */
                        simulated_now?: string;
                    };
                };
            };
        };
    };
}
