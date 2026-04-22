/**
 * Static options for dropdowns.
 * Replace these with your real lists (ids/labels) when ready.
 */
export const DRIVER_OPTIONS = [
  { id: 'JFB', label: 'J-F Breton' },
  { id: 'NG', label: 'Nicolas Guigère' },
  { id: 'JA', label: 'Jean Audet' },
]

export const VEHICLE_OPTIONS = [
  { id: 'JA-MICRA-2017', label: '-JA-MICRA-2017 belongs to driver JA', driverId: 'JA' },
  { id: 'JA-400Z-2025', label: '-JA-400Z-2025 belongs to driver JA', driverId: 'JA' },
  { id: 'JA-997-2012', label: '-JA-997-2012 belongs to driver JA', driverId: 'JA' },
  { id: 'JFB-GT4-2025', label: '- JFB-GT4-2025 belongs to driver JFB', driverId: 'JFB' },
  { id: 'NG-GT4-2025', label: '-NG-GT4-2025 belongs to driver NG', driverId: 'NG' },
]

export const getVehicleOptionsForDriver = (driverId) => {
  if (!driverId) {
    return VEHICLE_OPTIONS;
  }

  return VEHICLE_OPTIONS.filter((vehicle) => vehicle.driverId === driverId);
}

export const SESSION_TYPE_OPTIONS = [
  { id: 'Practice', label: 'Practice' },
  { id: 'Qualifying', label: 'Qualifying' },
  { id: 'Race', label: 'Race' },
]

export const PRESSURE_UNIT_OPTIONS = [
  { id: 'psi', label: 'psi' },
]

export const TRACK_OPTIONS = [
  { id: 'Sebring International Raceway', label: 'Sebring International Raceway' },
  { id: 'Daytona International Speedway', label: 'Daytona International Speedway' },
  { id: 'Road Atlanta', label: 'Road Atlanta' },
  { id: '__OTHER__', label: 'Other (type manually)' },
]
