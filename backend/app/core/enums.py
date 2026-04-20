from enum import Enum


class UserRole(str, Enum):
    OWNER = "OWNER"
    MECHANIC = "MECHANIC"
    ADMIN = "ADMIN"


class SubmissionStatus(str, Enum):
    PENDING = "PENDING"
    SENT = "SENT"
    FAILED = "FAILED"


class RunGroupCode(str, Enum):
    RED = "RED"
    BLUE = "BLUE"
    YELLOW = "YELLOW"
    GREEN = "GREEN"

