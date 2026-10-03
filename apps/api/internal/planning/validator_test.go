package planning

import (
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

func sampleRefData() RefData {
	outlets := map[string]OutletRef{
		"OUT-001": {
			OutletID:          "OUT-001",
			Brand:             "Fresh",
			District:          "Colombo",
			Depot:             "Peliyagoda",
			DockType:          "street",
			ParkingConstraint: "normal",
			WindowOpenTime:    "04:00:00",
			WindowCloseTime:   "08:00:00",
		},
		"OUT-002": {
			OutletID:          "OUT-002",
			Brand:             "Fresh",
			District:          "Gampaha",
			Depot:             "Peliyagoda",
			DockType:          "rear_dock",
			ParkingConstraint: "van_only",
			WindowOpenTime:    "04:00:00",
			WindowCloseTime:   "08:00:00",
		},
		"OUT-003": {
			OutletID:          "OUT-003",
			Brand:             "Style",
			District:          "Colombo",
			Depot:             "Peliyagoda",
			DockType:          "mall_bay",
			ParkingConstraint: "normal",
			MallWindow:        "10:00-14:00",
			WindowOpenTime:    "09:00:00",
			WindowCloseTime:   "18:00:00",
		},
		"OUT-KANDY": {
			OutletID:          "OUT-KANDY",
			Brand:             "Fresh",
			District:          "Kandy",
			Depot:             "Kandy",
			DockType:          "street",
			ParkingConstraint: "normal",
			WindowOpenTime:    "04:00:00",
			WindowCloseTime:   "08:00:00",
		},
	}

	vehicles := map[string]VehicleRef{
		"VEH-REEFER": {
			VehicleID:        "VEH-REEFER",
			Type:             "truck",
			Temp:             "reefer",
			WeightCapKg:      4000,
			VolumeCapM3:      20.0,
			VolumeCapUl:      20000000000,
			FuelType:         "diesel",
			KmPerL:           4.5,
			WeeklyFuelQuotaL: 200.0,
			Depot:            "Peliyagoda",
		},
		"VEH-AMBIENT": {
			VehicleID:        "VEH-AMBIENT",
			Type:             "truck",
			Temp:             "ambient",
			WeightCapKg:      5000,
			VolumeCapM3:      25.0,
			VolumeCapUl:      25000000000,
			FuelType:         "diesel",
			KmPerL:           5.0,
			WeeklyFuelQuotaL: 200.0,
			Depot:            "Peliyagoda",
		},
		"VEH-VAN": {
			VehicleID:        "VEH-VAN",
			Type:             "van",
			Temp:             "reefer",
			WeightCapKg:      1500,
			VolumeCapM3:      8.0,
			VolumeCapUl:      8000000000,
			FuelType:         "diesel",
			KmPerL:           8.5,
			WeeklyFuelQuotaL: 100.0,
			Depot:            "Peliyagoda",
		},
	}

	districts := map[string]DistrictTravelRef{
		"Colombo:Peliyagoda": {
			District:                   "Colombo",
			Depot:                      "Peliyagoda",
			DepotToDistrictKm:          15.0,
			DepotToDistrictFreeflowMin: 24,
			InterStopKm:                4.0,
			InterStopFreeflowMin:       8,
		},
		"Gampaha:Peliyagoda": {
			District:                   "Gampaha",
			Depot:                      "Peliyagoda",
			DepotToDistrictKm:          25.0,
			DepotToDistrictFreeflowMin: 37,
			InterStopKm:                6.0,
			InterStopFreeflowMin:       9,
		},
	}

	allowance := map[string]int{
		"Fresh:street":    16,
		"Fresh:rear_dock": 15,
		"Fresh:mall_bay":  20,
		"Style:mall_bay":  25,
	}

	return RefData{
		Outlets:             outlets,
		Vehicles:            vehicles,
		DistrictTravel:      districts,
		ServiceAllowance:    allowance,
		VehicleAvailability: map[string]string{"VEH-REEFER:2026-10-05": "available"},
	}
}

func TestValidator_ValidPlan(t *testing.T) {
	ref := sampleRefData()
	depart, _ := time.Parse("15:04", "04:00")

	plan := &PlanData{
		ID:       uuid.New(),
		Depot:    "Peliyagoda",
		PlanDate: "2026-10-05",
		Trips: []PlanTrip{
			{
				ID:            uuid.New(),
				VehicleID:     "VEH-REEFER",
				TripNo:        1,
				Brand:         "Fresh",
				District:      "Colombo",
				PlannedDepart: depart,
				Stops: []PlanStop{
					{
						ID:     uuid.New(),
						TripID: uuid.New(),
						Seq:    1,
						Order: PlanOrder{
							ID:              uuid.New(),
							Ref:             "ORD-001",
							OutletID:        "OUT-001",
							Brand:           "Fresh",
							TempRequirement: "chilled",
							TotalWeightG:    100000,   // 100 kg
							TotalVolumeUl:   20000000, // 0.02 m3
						},
					},
				},
			},
		},
	}

	violations := Validate(plan, ref, map[string]int64{"VEH-REEFER": 100000})
	assert.Empty(t, violations, "A completely valid plan should produce 0 violations")
}

func TestValidator_Rule1_MixedBrandDistrict(t *testing.T) {
	ref := sampleRefData()
	depart, _ := time.Parse("15:04", "04:00")

	plan := &PlanData{
		ID:       uuid.New(),
		Depot:    "Peliyagoda",
		PlanDate: "2026-10-05",
		Trips: []PlanTrip{
			{
				ID:            uuid.New(),
				VehicleID:     "VEH-REEFER",
				TripNo:        1,
				Brand:         "Fresh",
				District:      "Colombo",
				PlannedDepart: depart,
				Stops: []PlanStop{
					{
						ID:  uuid.New(),
						Seq: 1,
						Order: PlanOrder{
							ID:              uuid.New(),
							Ref:             "ORD-001",
							OutletID:        "OUT-001",
							Brand:           "Style", // Mismatched brand!
							TempRequirement: "ambient",
						},
					},
				},
			},
		},
	}

	violations := Validate(plan, ref, nil)
	assert.NotEmpty(t, violations)
	assert.Equal(t, CodeMixedBrandDistrict, violations[0].Code)
}

func TestValidator_Rule2_Refrigeration(t *testing.T) {
	ref := sampleRefData()
	depart, _ := time.Parse("15:04", "04:00")

	// Chilled order placed on ambient vehicle
	plan := &PlanData{
		ID:       uuid.New(),
		Depot:    "Peliyagoda",
		PlanDate: "2026-10-05",
		Trips: []PlanTrip{
			{
				ID:            uuid.New(),
				VehicleID:     "VEH-AMBIENT",
				TripNo:        1,
				Brand:         "Fresh",
				District:      "Colombo",
				PlannedDepart: depart,
				Stops: []PlanStop{
					{
						ID:  uuid.New(),
						Seq: 1,
						Order: PlanOrder{
							ID:              uuid.New(),
							Ref:             "ORD-001",
							OutletID:        "OUT-001",
							Brand:           "Fresh",
							TempRequirement: "chilled", // Needs reefer!
						},
					},
				},
			},
		},
	}

	violations := Validate(plan, ref, nil)
	assert.NotEmpty(t, violations)
	assert.Equal(t, CodeNeedReefer, violations[0].Code)
}

func TestValidator_Rule3_AccessConstraint(t *testing.T) {
	ref := sampleRefData()
	depart, _ := time.Parse("15:04", "04:00")

	// OUT-002 has parking_constraint = van_only, but VEH-REEFER is a truck
	plan := &PlanData{
		ID:       uuid.New(),
		Depot:    "Peliyagoda",
		PlanDate: "2026-10-05",
		Trips: []PlanTrip{
			{
				ID:            uuid.New(),
				VehicleID:     "VEH-REEFER", // Truck
				TripNo:        1,
				Brand:         "Fresh",
				District:      "Gampaha",
				PlannedDepart: depart,
				Stops: []PlanStop{
					{
						ID:  uuid.New(),
						Seq: 1,
						Order: PlanOrder{
							ID:              uuid.New(),
							Ref:             "ORD-002",
							OutletID:        "OUT-002", // Van only!
							Brand:           "Fresh",
							TempRequirement: "chilled",
						},
					},
				},
			},
		},
	}

	violations := Validate(plan, ref, nil)
	assert.NotEmpty(t, violations)
	assert.Equal(t, CodeVanOnly, violations[0].Code)
}

func TestValidator_Rule6_CapacityExceeded(t *testing.T) {
	ref := sampleRefData()
	depart, _ := time.Parse("15:04", "04:00")

	// Order weight 5,000 kg exceeds VEH-REEFER cap of 4,000 kg
	plan := &PlanData{
		ID:       uuid.New(),
		Depot:    "Peliyagoda",
		PlanDate: "2026-10-05",
		Trips: []PlanTrip{
			{
				ID:            uuid.New(),
				VehicleID:     "VEH-REEFER",
				TripNo:        1,
				Brand:         "Fresh",
				District:      "Colombo",
				PlannedDepart: depart,
				Stops: []PlanStop{
					{
						ID:  uuid.New(),
						Seq: 1,
						Order: PlanOrder{
							ID:              uuid.New(),
							Ref:             "ORD-001",
							OutletID:        "OUT-001",
							Brand:           "Fresh",
							TempRequirement: "chilled",
							TotalWeightG:    5000000, // 5000 kg > 4000 kg cap
							TotalVolumeUl:   1000000,
						},
					},
				},
			},
		},
	}

	violations := Validate(plan, ref, nil)
	assert.NotEmpty(t, violations)
	assert.Equal(t, CodeCapWeight, violations[0].Code)
}
