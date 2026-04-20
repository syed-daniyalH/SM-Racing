import { normalizeList, normalizeTrack } from "./apiTransforms";

const STORAGE_KEY = "sm2_admin_tracks_v1";

const nowIso = () => new Date().toISOString();

const createTrackId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `trk_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
};

const buildApiError = (message, status = 400, data = null) => ({
  status,
  message,
  error: message,
  detail: message,
  data,
});

const cloneTracks = (tracks = []) => tracks.map((track) => ({ ...track }));

export const mockTracks = [
  {
    track_id: "trk_sebring",
    track_name: "Sebring International Raceway",
    display_name: "Sebring",
    short_code: "SEB",
    country: "United States",
    latitude: 27.4503,
    longitude: -81.3488,
    notes: "Legacy endurance circuit used for race-weekend testing and setup validation.",
    status: "active",
    is_active: true,
    created_at: "2026-04-12T09:00:00Z",
    updated_at: "2026-04-20T16:12:00Z",
    archived_at: null,
  },
  {
    track_id: "trk_spa",
    track_name: "Circuit de Spa-Francorchamps",
    display_name: "Spa",
    short_code: "SPA",
    country: "Belgium",
    latitude: 50.4372,
    longitude: 5.9714,
    notes: "High-speed reference track with mixed weather conditions.",
    status: "active",
    is_active: true,
    created_at: "2026-04-10T10:15:00Z",
    updated_at: "2026-04-18T08:45:00Z",
    archived_at: null,
  },
  {
    track_id: "trk_bathurst",
    track_name: "Mount Panorama Circuit",
    display_name: "Bathurst",
    short_code: "BATH",
    country: "Australia",
    latitude: -33.4378,
    longitude: 149.5603,
    notes: "Used for hill-climb style operations and endurance testing.",
    status: "active",
    is_active: true,
    created_at: "2026-03-28T11:00:00Z",
    updated_at: "2026-04-02T14:30:00Z",
    archived_at: null,
  },
  {
    track_id: "trk_silverstone",
    track_name: "Silverstone Grand Prix Circuit",
    display_name: "Silverstone",
    short_code: "SILV",
    country: "United Kingdom",
    latitude: 52.0786,
    longitude: -1.0169,
    notes: "Primary British venue for high-throughput admin workflows.",
    status: "active",
    is_active: true,
    created_at: "2026-03-20T12:20:00Z",
    updated_at: "2026-04-16T13:05:00Z",
    archived_at: null,
  },
  {
    track_id: "trk_test",
    track_name: "Local Test Circuit",
    display_name: "Test Circuit",
    short_code: "TEST",
    country: "United States",
    latitude: 34.0522,
    longitude: -118.2437,
    notes: "Archived test track used for validation and admin UI testing.",
    status: "archived",
    is_active: false,
    created_at: "2026-02-12T09:00:00Z",
    updated_at: "2026-04-01T11:40:00Z",
    archived_at: "2026-04-01T11:40:00Z",
  },
];

const readStoredTracks = () => {
  if (typeof window === "undefined") {
    return cloneTracks(mockTracks);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (raw === null) {
    const seedTracks = cloneTracks(mockTracks);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedTracks));
    return seedTracks;
  }

  try {
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("Invalid track storage");
    }

    return parsed;
  } catch {
    const seedTracks = cloneTracks(mockTracks);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seedTracks));
    return seedTracks;
  }
};

const writeStoredTracks = (tracks) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
};

const parseCoordinate = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizePayload = (values = {}, existing = {}) => {
  const merged = { ...existing, ...values };
  const trackName = String(merged.track_name || merged.trackName || "").trim();
  const displayName = String(merged.display_name || merged.displayName || "").trim();
  const shortCode = String(merged.short_code || merged.shortCode || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
  const country = String(merged.country || merged.country_name || merged.countryName || "").trim();
  const latitude = parseCoordinate(merged.latitude ?? merged.lat);
  const longitude = parseCoordinate(merged.longitude ?? merged.lng ?? merged.lon);
  const notes = String(merged.notes || merged.description || "").trim();
  const statusInput = String(
    merged.status ||
      ((merged.is_active === false || merged.isActive === false) ? "archived" : "active"),
  ).toLowerCase();
  const status = statusInput === "archived" ? "archived" : "active";

  return {
    track_name: trackName,
    display_name: displayName || trackName,
    short_code: shortCode,
    country,
    latitude,
    longitude,
    notes,
    status,
    is_active: status !== "archived",
  };
};

const buildTrackRecord = (prepared, existing = null) => {
  const now = nowIso();
  const status = prepared.status === "archived" ? "archived" : "active";

  return {
    track_id: existing?.track_id || createTrackId(),
    track_name: prepared.track_name,
    display_name: prepared.display_name || prepared.track_name,
    short_code: prepared.short_code,
    country: prepared.country,
    latitude: prepared.latitude,
    longitude: prepared.longitude,
    notes: prepared.notes,
    status,
    is_active: status !== "archived",
    created_at: existing?.created_at || now,
    updated_at: now,
    archived_at: status === "archived" ? existing?.archived_at || now : null,
  };
};

const findDuplicateTrack = (tracks, prepared, excludeId = null) => {
  const requestedName = String(prepared.track_name || "").trim().toLowerCase();
  const requestedCode = String(prepared.short_code || "").trim().toLowerCase();

  return tracks.find((track) => {
    const currentId = String(track.track_id || track.id || "");
    if (excludeId && currentId === String(excludeId)) {
      return false;
    }

    const existingName = String(track.track_name || track.trackName || "").trim().toLowerCase();
    const existingCode = String(track.short_code || track.shortCode || "").trim().toLowerCase();

    return existingName === requestedName || existingCode === requestedCode;
  });
};

export const getTracks = async () => {
  const tracks = readStoredTracks();
  return {
    tracks: normalizeList(tracks, normalizeTrack),
  };
};

export const getTrackById = async (trackId) => {
  const tracks = readStoredTracks();
  const found = tracks.find((track) => String(track.track_id || track.id || "") === String(trackId));

  if (!found) {
    throw buildApiError("Track not found", 404);
  }

  return normalizeTrack(found);
};

export const createTrack = async (trackData) => {
  const tracks = readStoredTracks();
  const prepared = normalizePayload(trackData);

  if (!prepared.track_name || !prepared.short_code || !prepared.country) {
    throw buildApiError("Track name, short code, and country are required.", 400);
  }

  const duplicate = findDuplicateTrack(tracks, prepared);
  if (duplicate) {
    throw buildApiError(
      `A track with the same name or short code already exists (${duplicate.track_name || duplicate.display_name || duplicate.short_code}).`,
      409,
    );
  }

  const record = buildTrackRecord(prepared);
  const nextTracks = [record, ...tracks];
  writeStoredTracks(nextTracks);

  return {
    success: true,
    track: normalizeTrack(record),
  };
};

export const updateTrack = async (trackId, trackData) => {
  const tracks = readStoredTracks();
  const currentIndex = tracks.findIndex(
    (track) => String(track.track_id || track.id || "") === String(trackId),
  );

  if (currentIndex < 0) {
    throw buildApiError("Track not found", 404);
  }

  const currentTrack = tracks[currentIndex];
  const prepared = normalizePayload(trackData, currentTrack);

  if (!prepared.track_name || !prepared.short_code || !prepared.country) {
    throw buildApiError("Track name, short code, and country are required.", 400);
  }

  const duplicate = findDuplicateTrack(tracks, prepared, currentTrack.track_id || currentTrack.id);
  if (duplicate) {
    throw buildApiError(
      `A track with the same name or short code already exists (${duplicate.track_name || duplicate.display_name || duplicate.short_code}).`,
      409,
    );
  }

  const record = buildTrackRecord(prepared, currentTrack);
  const nextTracks = [...tracks];
  nextTracks[currentIndex] = record;
  writeStoredTracks(nextTracks);

  return {
    success: true,
    track: normalizeTrack(record),
  };
};

export const archiveTrack = async (trackId) => updateTrack(trackId, { status: "archived" });
