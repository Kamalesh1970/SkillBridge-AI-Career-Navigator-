from pydantic import BaseModel
from typing import List, Optional, Dict

class ExtractSkillsRequest(BaseModel):
    resume_text: str

class ExtractSkillsResponse(BaseModel):
    skills: List[str]
    projects: List[str]
    experience_level: str

class GapAnalysisRequest(BaseModel):
    skills: List[str]
    target_role: str

class GapAnalysisResponse(BaseModel):
    # Support both requested key conventions for safety
    matched: List[str]
    matched_skills: List[str]
    missing: List[str]
    missing_skills: List[str]
    partial: List[str]
    partial_skills: List[str]
    match_pct: float
    match_percentage: float
    summary: str
    summary_text: str
    reasoning: Optional[Dict[str, str]] = None

class LearningPathRequest(BaseModel):
    missing_skills: List[str]
    partial_skills: List[str]
    target_role: str

class ResourceItem(BaseModel):
    label: str
    url: str

class LearningPathStep(BaseModel):
    skill: str
    why_it_matters: str
    learning_time: str
    resources: List[ResourceItem]

class LearningPathResponse(BaseModel):
    roadmap: List[LearningPathStep]

class ChatMessage(BaseModel):
    role: str  # "assistant" (interviewer) or "user" (student)
    content: str

class InterviewTurnRequest(BaseModel):
    target_role: str
    history: List[ChatMessage]
    candidate_skills: Optional[List[str]] = None

class InterviewTurnResponse(BaseModel):
    next_message: str
    is_final: bool
    feedback: Optional[str] = None
