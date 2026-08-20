import io
import json
import logging
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional

from app.schemas import (
    ExtractSkillsRequest, ExtractSkillsResponse,
    GapAnalysisRequest, GapAnalysisResponse,
    LearningPathRequest, LearningPathResponse,
    InterviewTurnRequest, InterviewTurnResponse,
    ChatMessage
)
from app.llm import call_llm_json, call_llm_raw
from app.db import get_role_by_title, initialize_database

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="SkillBridge API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize ChromaDB and Seed Roles on Startup
@app.on_event("startup")
def startup_event():
    logger.info("Initializing vector store and seeding roles...")
    initialize_database()

@app.get("/roles")
def get_roles():
    """
    Returns the list of available target roles.
    """
    import os
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ROLES_FILE = os.path.join(BASE_DIR, "data", "job_roles.json")
    try:
        with open(ROLES_FILE, "r") as f:
            roles = json.load(f)
        return [role["title"] for role in roles]
    except Exception as e:
        logger.error(f"Failed to read roles list: {str(e)}")
        # Fallback list if something goes wrong
        return ["Data Analyst", "ML Engineer", "Frontend Developer", "Backend Developer", 
                "DevOps Engineer", "Data Scientist", "QA Engineer", "Product Analyst"]

def extract_text_from_pdf(content: bytes) -> str:
    """
    Helper to extract text from raw PDF bytes.
    """
    from pypdf import PdfReader
    try:
        reader = PdfReader(io.BytesIO(content))
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text.strip()
    except Exception as e:
        logger.error(f"PDF extraction failed: {str(e)}")
        raise HTTPException(status_code=400, detail="Failed to parse PDF file. Ensure it is a valid PDF.")

@app.post("/analyze/extract-skills", response_model=ExtractSkillsResponse)
async def extract_skills(
    file: Optional[UploadFile] = File(None),
    resume_text: Optional[str] = Form(None)
):
    """
    Extracts skills, projects, and experience level from a resume.
    Can accept a PDF/TXT file upload OR raw pasted text via form/json.
    """
    text = ""
    if file:
        content = await file.read()
        filename = file.filename.lower()
        if filename.endswith(".pdf"):
            text = extract_text_from_pdf(content)
        elif filename.endswith(".txt"):
            text = content.decode("utf-8", errors="ignore")
        else:
            # Fallback plain text reading
            text = content.decode("utf-8", errors="ignore")
    elif resume_text:
        text = resume_text
    else:
        raise HTTPException(status_code=400, detail="Must provide either a file upload or resume_text.")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Extracted resume text is empty.")

    system_prompt = (
        "You are an expert AI Resume Parser.\n"
        "Analyze the provided resume text and extract skills, projects, and experience level. "
        "Your response must be a valid JSON object matching this schema exactly:\n"
        "{\n"
        "  \"skills\": [\"list\", \"of\", \"skills\"],\n"
        "  \"projects\": [\"list\", \"of\", \"project titles/descriptions\"],\n"
        "  \"experience_level\": \"Student / Entry-level / Mid-level / Senior\"\n"
        "}\n"
        "Do not include any preambles, explanations, or code fences in your raw response."
    )
    
    prompt = f"Resume Content:\n---\n{text}\n---"
    
    try:
        parsed_json = call_llm_json(prompt, system_prompt=system_prompt)
        return ExtractSkillsResponse(
            skills=parsed_json.get("skills", []),
            projects=parsed_json.get("projects", []),
            experience_level=parsed_json.get("experience_level", "Entry-level")
        )
    except Exception as e:
        logger.error(f"Error calling LLM for skill extraction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"LLM parsing failed: {str(e)}")

@app.post("/analyze/gap", response_model=GapAnalysisResponse)
def gap_analysis(req: GapAnalysisRequest):
    """
    Retrieves target role data from ChromaDB and performs a skill-gap analysis.
    """
    role_data = get_role_by_title(req.target_role)
    if not role_data:
        raise HTTPException(status_code=404, detail=f"Target role '{req.target_role}' not found in database.")

    system_prompt = (
        "You are an expert Career Advisor and Skill Evaluator.\n"
        "Compare the user's current skills against the target job requirements.\n"
        "You must classify EVERY skill in the required and nice-to-have lists into exactly one of matched_skills, partial_skills, or missing_skills.\n"
        "Your response must be a valid JSON object matching this schema exactly:\n"
        "{\n"
        "  \"matched_skills\": [\"skills present in user list that match job needs\"],\n"
        "  \"missing_skills\": [\"skills required or nice-to-have for the job that are missing from user list and have no relation\"],\n"
        "  \"partial_skills\": [\"skills the user has some relation to, or basic equivalents that need enhancement\"],\n"
        "  \"match_percentage\": 75.0,\n"
        "  \"summary_text\": \"A 2-3 sentence summary explaining the key gaps and how the candidate stands.\",\n"
        "  \"reasoning\": {\n"
        "    \"SkillName1\": \"Brief 1-sentence justification for its classification...\",\n"
        "    \"SkillName2\": \"Brief 1-sentence justification for its classification...\"\n"
        "  }\n"
        "}\n"
        "Ensure every single skill in both input lists is classified and present as a key in the reasoning object.\n"
        "Do not include any preambles, explanations, or code fences."
    )

    prompt = (
        f"User Current Skills: {req.skills}\n\n"
        f"Target Role details:\n"
        f"Title: {role_data['title']}\n"
        f"Required Skills (Must classify every single one): {role_data['required_skills']}\n"
        f"Nice To Have Skills (Must classify every single one): {role_data['nice_to_have_skills']}\n"
        f"Sample Job Description: {role_data['sample_JD_text']}\n\n"
        f"Please perform the classification. Ensure every single skill listed in Required Skills and Nice To Have Skills is placed in one of the three lists: matched_skills, partial_skills, or missing_skills, and exists as a key in the 'reasoning' object with a short explanation."
    )

    try:
        parsed_json = call_llm_json(prompt, system_prompt=system_prompt)
        
        # Populate both formats of response keys for compatibility
        matched = parsed_json.get("matched_skills", parsed_json.get("matched", []))
        missing = parsed_json.get("missing_skills", parsed_json.get("missing", []))
        partial = parsed_json.get("partial_skills", parsed_json.get("partial", []))
        summary = parsed_json.get("summary_text", parsed_json.get("summary", ""))
        reasoning = parsed_json.get("reasoning", {})

        # Assert check in Python and log a warning if mismatch
        expected_total = len(role_data.get("required_skills", [])) + len(role_data.get("nice_to_have_skills", []))
        actual_total = len(matched) + len(partial) + len(missing)
        if actual_total != expected_total:
            logger.warning(f"Skill count mismatch! Expected {expected_total} skills classified, but got {actual_total}. "
                           f"Required: {role_data.get('required_skills')}, Nice to have: {role_data.get('nice_to_have_skills')}. "
                           f"Classified: Matched={matched}, Partial={partial}, Missing={missing}")

        # Recompute match percentage in Python
        total_required_skills = len(role_data.get("required_skills", []))
        matched_required_skills = [s for s in role_data.get("required_skills", []) if any(s.lower() == m.lower() for m in matched)]
        matched_count = len(matched_required_skills)
        match_pct = round((matched_count / total_required_skills) * 100, 1) if total_required_skills > 0 else 0.0

        return GapAnalysisResponse(
            matched=matched,
            matched_skills=matched,
            missing=missing,
            missing_skills=missing,
            partial=partial,
            partial_skills=partial,
            match_pct=match_pct,
            match_percentage=match_pct,
            summary=summary,
            summary_text=summary,
            reasoning=reasoning
        )
    except Exception as e:
        logger.error(f"Error calling LLM for gap analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=f"LLM gap analysis failed: {str(e)}")

@app.post("/learning-path", response_model=LearningPathResponse)
def learning_path(req: LearningPathRequest):
    """
    Generates a personalized, step-by-step learning path roadmap.
    """
    system_prompt = (
        "You are an expert technical curriculum designer.\n"
        "Generate a structured learning path roadmap for a candidate who is targeting a role and needs to acquire missing or enhance partial skills.\n"
        "Your response must be a valid JSON object matching this schema exactly:\n"
        "{\n"
        "  \"roadmap\": [\n"
        "    {\n"
        "      \"skill\": \"Skill name\",\n"
        "      \"why_it_matters\": \"Why this is crucial for the role.\",\n"
        "      \"learning_time\": \"Estimated study time (e.g. 2 weeks)\",\n"
        "      \"resources\": [\n"
        "        {\n"
        "          \"label\": \"Resource display name (e.g. Official Python Tutorial)\",\n"
        "          \"url\": \"Stable, well-known homepage URL (e.g. https://docs.python.org/3/tutorial/)\"\n"
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}\n"
        "Rules for resources:\n"
        "1. Use ONLY real, stable, well-known URLs (e.g. official documentation homepages, freecodecamp.org, developer.mozilla.org, khanacademy.org, coursera.org search pages).\n"
        "2. Never fabricate/invent specific subpaths or detail pages if you are not sure they exist. Instead, fall back to a Google search query URL: https://www.google.com/search?q=<url-encoded+resource+name>\n"
        "Do not include any preambles, explanations, or code fences."
    )

    prompt = (
        f"Target Role: {req.target_role}\n"
        f"Missing Skills: {req.missing_skills}\n"
        f"Partial Skills to Improve: {req.partial_skills}\n"
    )

    try:
        parsed_json = call_llm_json(prompt, system_prompt=system_prompt)
        return LearningPathResponse(
            roadmap=parsed_json.get("roadmap", [])
        )
    except Exception as e:
        logger.error(f"Error calling LLM for learning path: {str(e)}")
        raise HTTPException(status_code=500, detail=f"LLM roadmap generation failed: {str(e)}")

@app.post("/interview/turn", response_model=InterviewTurnResponse)
def interview_turn(req: InterviewTurnRequest):
    """
    Handles a single turn in the chat-based mock interview.
    Stores and reads history client-side (stateless backend).
    Concludes the interview on the 5th answer.
    """
    role_data = get_role_by_title(req.target_role)
    if not role_data:
        raise HTTPException(status_code=404, detail=f"Target role '{req.target_role}' not found.")

    user_answers = [msg for msg in req.history if msg.role == "user"]
    num_answers = len(user_answers)
    logger.info(f"Interview Turn Called. History Length: {len(req.history)}, num_answers: {num_answers}")

    # Initialize Interview
    if num_answers == 0:
        system_prompt = (
            f"You are a friendly but professional technical interviewer for the '{req.target_role}' position.\n"
            "Your job is to conduct a short 5-question mock interview. "
            "Please ask the first question to begin the interview. "
            "Typical questions for this role are: " + ", ".join(role_data["typical_interview_questions"]) + "\n"
            "Keep the question clear, direct, and tailored to the target role. "
            "Do not output anything except the first question."
        )
        try:
            first_q = call_llm_raw("Start the mock interview.", system_prompt=system_prompt)
            return InterviewTurnResponse(
                next_message=first_q.strip(),
                is_final=False,
                feedback=None
            )
        except Exception as e:
            logger.error(f"Error starting interview: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to start interview: {str(e)}")

    # Final Summary Evaluation Turn
    elif num_answers >= 5:
        # User has finished answering 5 questions. Evaluate history and output final feedback
        system_prompt = (
            f"You are a senior tech lead conducting a performance evaluation for a mock interview for the '{req.target_role}' role.\n"
            "Review the conversation history and the user's answers. "
            "Your response must be a valid JSON object matching this schema exactly:\n"
            "{\n"
            "  \"feedback\": \"A 1-2 sentence final evaluation of the last answer.\",\n"
            "  \"next_message\": \"### Mock Interview Scorecard\\n\\n**Strengths:**\\n- Strength 1\\n- Strength 2\\n\\n**Weaknesses/Gaps:**\\n- Weakness 1\\n- Weakness 2\\n\\n**Actionable Tips:**\\n- Major advice detail...\",\n"
            "  \"is_final\": true\n"
            "}\n"
            "Format the next_message nicely in Markdown with strengths, weaknesses, and a final actionable tip.\n"
            "Do not include any preambles, explanations, or code fences."
        )
        
        # Format the chat history into text
        history_text = "\n".join([f"{msg.role.upper()}: {msg.content}" for msg in req.history])
        
        try:
            parsed_json = call_llm_json(history_text, system_prompt=system_prompt)
            return InterviewTurnResponse(
                next_message=parsed_json.get("next_message", "Evaluation summary not available."),
                is_final=True,
                feedback=parsed_json.get("feedback")
            )
        except Exception as e:
            logger.error(f"Error finishing interview: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to evaluate interview: {str(e)}")

    # Mid-Interview Turns (Questions 2 through 5)
    else:
        # 1 to 4 answers have been submitted. Analyze the last answer and ask the next question
        system_prompt = (
            f"You are a friendly but professional technical interviewer for the '{req.target_role}' position.\n"
            "You are conducting a short 5-question mock interview. "
            f"The candidate has answered {num_answers} question(s) out of 5.\n"
            "Analyze the candidate's last answer and provide brief feedback (1-2 sentences) on what was good or how to improve.\n"
            "Then, ask the next question (Question number {num_answers + 1}).\n"
            "Your response must be a valid JSON object matching this schema exactly:\n"
            "{\n"
            "  \"feedback\": \"1-2 sentences of immediate feedback on their last answer.\",\n"
            "  \"next_message\": \"The next interview question...\",\n"
            "  \"is_final\": false\n"
            "}\n"
            "Do not include any preambles, explanations, or code fences."
        )

        history_text = "\n".join([f"{msg.role.upper()}: {msg.content}" for msg in req.history])

        try:
            parsed_json = call_llm_json(history_text, system_prompt=system_prompt)
            return InterviewTurnResponse(
                next_message=parsed_json.get("next_message", "Next question could not be generated."),
                is_final=False,
                feedback=parsed_json.get("feedback")
            )
        except Exception as e:
            logger.error(f"Error during mid-interview turn: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Failed to generate next turn: {str(e)}")
