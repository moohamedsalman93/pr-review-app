from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class RuleSetBase(BaseModel):
    name: str
    description: Optional[str] = None
    instructions: str


class RuleSetCreate(RuleSetBase):
    pass


class RuleSetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None


class RuleSetResponse(RuleSetBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
