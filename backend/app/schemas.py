from datetime import datetime
from typing import Optional, List, Literal, Any, Dict
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserRegister(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    name: str
    is_admin: bool
    created_at: datetime


class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    scopes: List[str] = Field(default_factory=list)
    expires_at: Optional[datetime] = None

class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    prefix: str
    scopes: List[str]
    is_active: bool
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    created_at: datetime
    revoked_at: Optional[datetime]

class ApiKeyCreated(ApiKeyOut):
    key: str


class UsageSummary(BaseModel):
    total_requests: int
    total_bytes_in: int
    total_bytes_out: int
    total_units: float
    success_count: int
    error_count: int
    per_endpoint: Dict[str, int]

class UsageLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    endpoint: str
    status_code: int
    duration_ms: int
    bytes_in: int
    bytes_out: int
    units: float
    error: Optional[str]
    created_at: datetime


class SttWord(BaseModel):
    word: str
    start: float
    end: float
    probability: float

class SttResponse(BaseModel):
    text: str
    words: List[SttWord] = Field(default_factory=list)
    language: Optional[str] = None
    duration: Optional[float] = None
    model: str

class TtsResponse(BaseModel):
    audio_base64: str
    format: str
    voice: str
    model: str
    timings: List[Dict[str, Any]] = Field(default_factory=list)

class VoicesResponse(BaseModel):
    voices: List[str]
    default: Optional[str] = None


class MessageResponse(BaseModel):
    message: str
