# Waypoint Operational Role Shells

Waypoint accommodates four primary operational roles within ONE unified React PWA:

## 1. Administrator (`admin`)
- **Route / Shell**: `/admin`
- **Scope**: Platform health, database connection status, user directory, system diagnostic metrics, and Asia/Colombo shift monitoring.
- **Theme Accent**: Indigo (`#6366f1`)

## 2. Dispatcher / Supervisor (`dispatcher`)
- **Route / Shell**: `/dispatcher`
- **Scope**: Central command tower for operations across Sri Lanka. Responsible for creating waypoints, assigning tasks to field agents and drivers, and triggering ML route optimization.
- **Theme Accent**: Sky Blue (`#0284c7`)

## 3. Field Agent / Inspector (`field_agent`)
- **Route / Shell**: `/field-agent`
- **Scope**: Mobile inspection interface designed for outdoor use. Works 100% offline via IndexedDB outbox. Allows agents to check inspection items, record notes, and update statuses without cellular coverage.
- **Theme Accent**: Emerald Green (`#059669`)

## 4. Driver / Crew (`driver`)
- **Route / Shell**: `/driver`
- **Scope**: High-visibility in-vehicle cockpit view. Shows current active waypoint stop, ML-calculated travel duration and distance, turn-by-turn navigation link, and one-tap delivery completion.
- **Theme Accent**: Amber / Orange (`#d97706`)
