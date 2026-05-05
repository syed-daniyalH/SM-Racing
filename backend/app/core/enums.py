from enum import Enum


class UserRole(str, Enum):
    OWNER = "OWNER"
    MECHANIC = "MECHANIC"
    ADMIN = "ADMIN"


class UserApprovalStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"


class SubmissionStatus(str, Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"


class VoiceNoteStatus(str, Enum):
    DRAFT = "DRAFT"
    RECORDING = "RECORDING"
    UPLOADED = "UPLOADED"
    PENDING_TRANSCRIPTION = "PENDING_TRANSCRIPTION"
    TRANSCRIBING = "TRANSCRIBING"
    TRANSCRIBED = "TRANSCRIBED"
    TRANSCRIPTION_FAILED = "TRANSCRIPTION_FAILED"
    PENDING_REVIEW = "PENDING_REVIEW"
    CONFIRMED = "CONFIRMED"
    SUBMITTED = "SUBMITTED"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    ARCHIVED = "ARCHIVED"


class RunGroupCode(str, Enum):
    RED = "RED"
    BLUE = "BLUE"
    YELLOW = "YELLOW"
    GREEN = "GREEN"


class TireInventoryStatus(str, Enum):
    ACTIVE = "ACTIVE"
    DISCARDED = "DISCARDED"


class SeanceStatus(str, Enum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"
