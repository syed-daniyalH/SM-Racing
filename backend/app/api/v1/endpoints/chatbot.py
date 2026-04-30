import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.database import get_db
from app.core.enums import UserRole
from app.models.user import User
from app.schemas.chatbot import ChatbotContextResponse, ChatbotQuery, ChatbotResponse
from app.services.chatbot_service import build_chatbot_context, build_chatbot_response


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin/chatbot")


@router.get("/context", response_model=ChatbotContextResponse, response_model_exclude_none=True)
def read_chatbot_context(
    db: Session = Depends(get_db),
    _: object = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> ChatbotContextResponse:
    logger.info("Admin chatbot context requested")
    return build_chatbot_context(db)


@router.post("/query", response_model=ChatbotResponse, response_model_exclude_none=True)
def query_chatbot(
    query_in: ChatbotQuery,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.OWNER, UserRole.ADMIN)),
) -> ChatbotResponse:
    logger.info(
        "Admin chatbot query received: message=%s event_id=%s session_id=%s driver_id=%s vehicle_id=%s",
        query_in.message,
        query_in.event_id,
        query_in.session_id,
        query_in.driver_id,
        query_in.vehicle_id,
    )
    return build_chatbot_response(db, query_in, current_user=current_user)
