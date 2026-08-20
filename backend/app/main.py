import io
import json
import logging
import time
import re
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from typing import List, Optional

from app.schemas import (
    ExtractSkillsRequest, ExtractSkillsResponse,
    GapAnalysisRequest, GapAnalysisResponse,
    LearningPathRequest, LearningPathResponse,
    InterviewTurnRequest, InterviewTurnResponse,
    ChatMessage
)
from app.llm import call_llm_json, call_llm_raw, load_skill_taxonomy, extract_skills_from_text_via_taxonomy, detect_meta_request
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

# Custom Exception Handlers to standardize error responses to {"error": detail, "detail": detail}
@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail,
            "detail": exc.detail
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    details = exc.errors()
    error_msg = "Validation failed: " + "; ".join([f"{'.'.join(str(loc) for loc in d['loc'])} - {d['msg']}" for d in details])
    return JSONResponse(
        status_code=422,
        content={
            "error": error_msg,
            "detail": error_msg
        }
    )

# Helper to raise appropriate 502/504 status codes for LLM failures
def handle_llm_exception(e: Exception, action_name: str):
    err_msg = str(e).lower()
    if "timeout" in err_msg or "deadline" in err_msg or "time out" in err_msg:
        raise HTTPException(
            status_code=504,
            detail=f"The AI model provider timed out during {action_name}. Please try again later."
        )
    elif any(term in err_msg for term in ["auth", "key", "rate limit", "quota", "balance", "credit", "connection"]):
        raise HTTPException(
            status_code=502,
            detail=f"The AI model provider is currently unavailable or returned a service error: {str(e)}"
        )
    else:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to communicate with AI model provider during {action_name}: {str(e)}"
        )

# In-memory cache for target roles
_roles_cache = None

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
    global _roles_cache
    if _roles_cache is not None:
        return _roles_cache

    logger.info("Fetching target roles list...")
    import os
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ROLES_FILE = os.path.join(BASE_DIR, "data", "job_roles.json")
    try:
        with open(ROLES_FILE, "r") as f:
            roles = json.load(f)
        _roles_cache = [role["title"] for role in roles]
        logger.info(f"Successfully loaded and cached {len(_roles_cache)} roles.")
        return _roles_cache
    except Exception as e:
        logger.error(f"Failed to read roles list: {str(e)}")
        # Fallback list if something goes wrong
        return ["Data Analyst", "ML Engineer", "Frontend Developer", "Backend Developer", 
                "DevOps Engineer", "Data Scientist", "QA Engineer", "Product Analyst"]

def normalize_merged_words(text: str) -> str:
    """
    Splits words that were fused together due to PDF layout text run stripping
    without breaking protected camelCase keywords.
    """
    PROTECTED_WORDS = [
        "PyTorch", "TensorFlow", "JavaScript", "TypeScript", 
        "FastAPI", "PaddleOCR", "OpenCV", "PowerBI", "GitHub", 
        "HuggingFace", "Jupyter", "Kaggle", "Firebase", "ROS2", "FAISS"
    ]
    
    # 1. Replace protected words with placeholders
    placeholders = {}
    temp_text = text
    for idx, word in enumerate(PROTECTED_WORDS):
        placeholder = f"__PROTECTWORD_{idx}__"
        # Case-insensitive replacement of standard camelCase keyword
        pattern = re.compile(rf"\b{re.escape(word)}\b", re.IGNORECASE)
        matches = pattern.findall(temp_text)
        if matches:
            placeholders[placeholder] = matches[0]
            temp_text = pattern.sub(placeholder, temp_text)

    # 2. Split lowercase immediately followed by uppercase (e.g. SystemFastAPI -> System FastAPI)
    temp_text = re.sub(r"([a-z])([A-Z])", r"\1 \2", temp_text)
    
    # 3. Split acronym followed by capitalized word (e.g. VQASystem -> VQA System)
    temp_text = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", temp_text)
    
    # 4. Split acronym followed by lowercase word (e.g. RAGsystem -> RAG system)
    temp_text = re.sub(r"\b([A-Z]{2,})([a-z]+)\b", r"\1 \2", temp_text)

    # 5. Split lowercase followed by protected word placeholders
    temp_text = re.sub(r"([a-z])(__PROTECTWORD_\d+__)", r"\1 \2", temp_text)
    
    # 6. Split uppercase followed by protected word placeholders
    temp_text = re.sub(r"([A-Z])(__PROTECTWORD_\d+__)", r"\1 \2", temp_text)
    
    # 7. Split protected word placeholders followed by lowercase
    temp_text = re.sub(r"(__PROTECTWORD_\d+__)([a-z])", r"\1 \2", temp_text)

    # 8. Restore protected words
    for placeholder, original in placeholders.items():
        temp_text = temp_text.replace(placeholder, original)
        
    return temp_text

def extract_text_from_pdf(content: bytes) -> str:
    """
    Helper to extract text from raw PDF bytes using pdfplumber (preferred) or pypdf (fallback).
    Also applies space-recovery normalization to resolve adjacent word fusions.
    """
    text = ""
    
    # Try pdfplumber first (highly reliable layout/multi-column parsing)
    try:
        import pdfplumber
        logger.info("Extracting PDF text using pdfplumber...")
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text(layout=True)
                if page_text:
                    text += page_text + "\n"
        if text.strip():
            logger.info("Successfully extracted text via pdfplumber.")
            text = normalize_merged_words(text)
            return text.strip()
    except ImportError:
        logger.info("pdfplumber not available in virtualenv. Falling back to pypdf...")
    except Exception as e:
        logger.error(f"pdfplumber extraction failed: {str(e)}")

    # Fallback to pypdf
    try:
        from pypdf import PdfReader
        logger.info("Extracting PDF text using pypdf reader...")
        reader = PdfReader(io.BytesIO(content))
        text = ""
        for page in reader.pages:
            try:
                # Use layout mode if supported in the library version
                page_text = page.extract_text(extraction_mode="layout")
            except Exception:
                page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        
        text = normalize_merged_words(text)
        return text.strip()
    except Exception as e:
        logger.error(f"pypdf extraction fallback failed: {str(e)}")
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
    logger.info("Incoming request: /analyze/extract-skills")
    text = ""
    if file:
        content = await file.read()
        filename = file.filename.lower()
        if filename.endswith(".pdf"):
            text = extract_text_from_pdf(content)
        elif filename.endswith(".txt"):
            try:
                text = content.decode("utf-8")
            except UnicodeDecodeError:
                raise HTTPException(status_code=400, detail="Failed to decode text file. Ensure it is UTF-8 encoded.")
        else:
            raise HTTPException(
                status_code=400,
                detail="Unsupported file format. Please upload a PDF (.pdf) or text (.txt) file."
            )
    elif resume_text:
        text = resume_text
    else:
        raise HTTPException(status_code=400, detail="Must provide either a file upload or resume_text.")

    if not text.strip():
        raise HTTPException(status_code=400, detail="Extracted resume text is empty.")

    # Log raw extracted resume text (Task 1 investigation step)
    logger.info(f"Raw Extracted Resume Text (Length {len(text)}):\n{text}\n--- END RAW TEXT ---")

    # Truncate extremely long resume text to prevent token limit errors
    MAX_CHARACTERS = 30000
    if len(text) > MAX_CHARACTERS:
        logger.info(f"Truncating long resume text from {len(text)} to {MAX_CHARACTERS} characters.")
        text = text[:MAX_CHARACTERS] + "\n... [truncated due to length] ..."

    # Load skill taxonomy to guide and validate LLM extraction
    taxonomy = load_skill_taxonomy()
    taxonomy_skills_list = []
    if taxonomy:
        for category, skills in taxonomy.items():
            taxonomy_skills_list.extend(skills.keys())

    system_prompt = (
        "You are an expert AI Resume Parser.\n"
        "Analyze the provided resume text and extract skills, projects, and experience level.\n"
        "Your response must be a valid JSON object matching this schema exactly:\n"
        "{\n"
        "  \"skills\": [\"list\", \"of\", \"skills\"],\n"
        "  \"projects\": [\"list\", \"of\", \"project titles/descriptions\"],\n"
        "  \"experience_level\": \"Student / Entry-level / Mid-level / Senior\"\n"
        "}\n"
        "Rules for skills:\n"
        f"Prioritize extracting and normalizing to standard skill names from this taxonomy list: {', '.join(taxonomy_skills_list)}.\n"
        "Do not include any preambles, explanations, or code fences in your raw response."
    )
    
    prompt = f"Resume Content:\n---\n{text}\n---"
    
    try:
        start_time = time.time()
        parsed_json = call_llm_json(prompt, system_prompt=system_prompt)
        duration = time.time() - start_time
        logger.info(f"LLM skill extraction completed in {duration:.2f}s")
        
        extracted_skills = parsed_json.get("skills", [])
        projects = parsed_json.get("projects", [])
        experience_level = parsed_json.get("experience_level", "Entry-level")

        # Local taxonomy regex matching to ensure we never drop explicitly-written skills
        local_matched_skills = extract_skills_from_text_via_taxonomy(text)
        
        # Combine and normalize
        final_skills_set = set()
        
        # 1. Add locally matched taxonomy skills first (always accurate)
        for s in local_matched_skills:
            final_skills_set.add(s)
            
        # 2. Add LLM extracted skills, checking taxonomy mapping to normalize them
        for s in extracted_skills:
            s_stripped = s.strip()
            # Normalize to standard case/naming if it matches an alias
            normalized = None
            if taxonomy:
                s_lower = s_stripped.lower()
                for cat, skills_dict in taxonomy.items():
                    for std_name, aliases in skills_dict.items():
                        if s_lower == std_name.lower() or s_lower in [a.lower() for a in aliases]:
                            normalized = std_name
                            break
                    if normalized:
                        break
            
            final_skills_set.add(normalized or s_stripped)

        skills_list = sorted(list(final_skills_set))
        logger.info(f"Successfully extracted {len(skills_list)} skills (local regex: {len(local_matched_skills)}, LLM raw: {len(extracted_skills)}) and {len(projects)} projects.")
        
        return ExtractSkillsResponse(
            skills=skills_list,
            projects=projects,
            experience_level=experience_level
        )
    except Exception as e:
        logger.error(f"Error calling LLM for skill extraction: {str(e)}")
        handle_llm_exception(e, "skill extraction")

@app.post("/analyze/gap", response_model=GapAnalysisResponse)
def gap_analysis(req: GapAnalysisRequest):
    """
    Retrieves target role data from ChromaDB and performs a skill-gap analysis.
    For custom roles, asks the LLM to infer the required skills on the fly.
    """
    logger.info(f"Incoming request: /analyze/gap for role '{req.target_role}'")
    
    is_custom = req.target_role.lower() in ["other", "other (custom)", "custom"] or req.target_role.startswith("Other")
    
    role_data = None
    if not is_custom:
        role_data = get_role_by_title(req.target_role)
        
    if not role_data and not is_custom:
        raise HTTPException(status_code=404, detail=f"Target role '{req.target_role}' not found in database.")

    if is_custom:
        system_prompt = (
            "You are an expert Career Advisor and Skill Evaluator.\n"
            "The candidate is targeting a custom job role. Since there is no predefined dataset for this role, "
            "you MUST infer a reasonable list of 5 required skills and 3 nice-to-have skills for this title, and then compare the user's current skills against them.\n"
            "Classify every inferred skill into exactly one of matched_skills, partial_skills, or missing_skills.\n"
            "Your response must be a valid JSON object matching this schema exactly:\n"
            "{\n"
            "  \"inferred_required_skills\": [\"list of 5 required skills you inferred for this custom role\"],\n"
            "  \"inferred_nice_to_have_skills\": [\"list of 3 nice-to-have skills you inferred for this custom role\"],\n"
            "  \"matched_skills\": [\"skills present in user list that match inferred needs\"],\n"
            "  \"missing_skills\": [\"skills from inferred list that are missing from user list and have no relation\"],\n"
            "  \"partial_skills\": [\"skills the user has some relation to, or basic equivalents that need enhancement\"],\n"
            "  \"match_percentage\": 75.0,\n"
            "  \"summary_text\": \"A 2-3 sentence summary explaining the key gaps and how the candidate stands. Clearly mention that this is an AI-inferred estimate.\",\n"
            "  \"reasoning\": {\n"
            "    \"SkillName1\": \"Brief 1-sentence justification for its classification...\",\n"
            "    \"SkillName2\": \"Brief 1-sentence justification for its classification...\"\n"
            "  }\n"
            "}\n"
            "Ensure every single inferred skill is classified and present as a key in the reasoning object.\n"
            "Do not include any preambles, explanations, or code fences."
        )
        prompt = (
            f"User Current Skills: {req.skills}\n\n"
            f"Target Role: {req.target_role}\n\n"
            "Please infer the required and nice-to-have skills for this role, and perform the classification. "
            "Ensure every inferred skill is placed in one of matched_skills, partial_skills, or missing_skills, and exists as a key in the 'reasoning' object with a short explanation."
        )
    else:
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
        start_time = time.time()
        parsed_json = call_llm_json(prompt, system_prompt=system_prompt)
        duration = time.time() - start_time
        logger.info(f"LLM gap analysis completed in {duration:.2f}s")
        
        # Populate both formats of response keys for compatibility
        matched = parsed_json.get("matched_skills", parsed_json.get("matched", []))
        missing = parsed_json.get("missing_skills", parsed_json.get("missing", []))
        partial = parsed_json.get("partial_skills", parsed_json.get("partial", []))
        summary = parsed_json.get("summary_text", parsed_json.get("summary", ""))
        reasoning = parsed_json.get("reasoning", {})

        # Python-side reconciliation to guarantee 100% classification accuracy and prevent hallucinations
        if is_custom:
            all_required = parsed_json.get("inferred_required_skills", ["Technical Design", "Problem Solving", "Communication", "System Architecture", f"{req.target_role} Core"])
            all_nice = parsed_json.get("inferred_nice_to_have_skills", ["Docker", "Git", "Project Management"])
        else:
            all_required = [s.strip() for s in role_data.get("required_skills", []) if s.strip()]
            all_nice = [s.strip() for s in role_data.get("nice_to_have_skills", []) if s.strip()]
        input_skills = all_required + all_nice
        
        llm_matched_lower = {m.lower().strip() for m in matched}
        llm_partial_lower = {p.lower().strip() for p in partial}
        
        validated_matched = []
        validated_partial = []
        validated_missing = []
        validated_reasoning = {}
        
        for skill in input_skills:
            skill_lower = skill.lower()
            orig_reasoning = reasoning.get(skill, reasoning.get(skill_lower, ""))
            if not orig_reasoning:
                # Case-insensitive key search
                for k, v in reasoning.items():
                    if k.lower() == skill_lower:
                        orig_reasoning = v
                        break
            
            if skill_lower in llm_matched_lower:
                validated_matched.append(skill)
                validated_reasoning[skill] = orig_reasoning or f"Candidate has matching experience in required skill '{skill}'."
            elif skill_lower in llm_partial_lower:
                validated_partial.append(skill)
                validated_reasoning[skill] = orig_reasoning or f"Candidate has basic exposure to '{skill}' but needs enhancement."
            else:
                validated_missing.append(skill)
                validated_reasoning[skill] = orig_reasoning or f"Candidate lacks training or experience in '{skill}'."

        # Recompute match percentage in Python based on validated required skills
        matched_required_count = len([s for s in all_required if s in validated_matched])
        total_required_count = len(all_required)
        match_pct = round((matched_required_count / total_required_count) * 100, 1) if total_required_count > 0 else 0.0

        logger.info(f"Gap analysis completed. Reconciled skills count: {len(validated_matched) + len(validated_partial) + len(validated_missing)}/{len(input_skills)}. Match percentage: {match_pct}%")
        return GapAnalysisResponse(
            matched=validated_matched,
            matched_skills=validated_matched,
            missing=validated_missing,
            missing_skills=validated_missing,
            partial=validated_partial,
            partial_skills=validated_partial,
            match_pct=match_pct,
            match_percentage=match_pct,
            summary=summary,
            summary_text=summary,
            reasoning=validated_reasoning
        )
    except Exception as e:
        logger.error(f"Error calling LLM for gap analysis: {str(e)}")
        handle_llm_exception(e, "gap analysis")

@app.post("/learning-path", response_model=LearningPathResponse)
def learning_path(req: LearningPathRequest):
    """
    Generates a personalized, step-by-step learning path roadmap.
    """
    logger.info(f"Incoming request: /learning-path for role '{req.target_role}'")
    # Performance Optimization: Zero missing/partial skills requires no LLM call
    if not req.missing_skills and not req.partial_skills:
        logger.info("Candidate has zero missing or partial skills. Returning empty roadmap immediately.")
        return LearningPathResponse(roadmap=[])

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
        start_time = time.time()
        parsed_json = call_llm_json(prompt, system_prompt=system_prompt)
        duration = time.time() - start_time
        logger.info(f"LLM learning path generation completed in {duration:.2f}s")
        
        roadmap = parsed_json.get("roadmap", [])
        logger.info(f"Successfully generated learning path with {len(roadmap)} steps.")
        return LearningPathResponse(roadmap=roadmap)
    except Exception as e:
        logger.error(f"Error calling LLM for learning path: {str(e)}")
        handle_llm_exception(e, "learning path generation")

@app.post("/interview/turn", response_model=InterviewTurnResponse)
def interview_turn(req: InterviewTurnRequest):
    """
    Handles a single turn in the chat-based mock interview.
    Stores and reads history client-side (stateless backend).
    Concludes the interview on the 5th answer.
    """
    logger.info(f"Incoming request: /interview/turn for role '{req.target_role}'")
    role_data = get_role_by_title(req.target_role)
    
    # Ground questions in candidate's resume skills if provided
    skills_context = ""
    if req.candidate_skills:
        skills_context = f"The candidate's profile has the following extracted resume skills: {', '.join(req.candidate_skills)}. You should prioritize asking questions related to these skills when applicable.\n"
    else:
        skills_context = "No resume skills were provided; ask standard role-specific questions.\n"

    if not role_data:
        # Support dynamic estimation for custom roles (Other)
        if req.target_role.lower() in ["other", "other (custom)", "custom"] or req.target_role.startswith("Other"):
            logger.info("Custom role selected. Skipping static role data lookup and using dynamic AI estimation.")
            role_data = {
                "title": req.target_role,
                "typical_interview_questions": [
                    "Can you tell me about your background and how your experience aligns with this position?",
                    "What are some key technical tools and workflows you use for this role?",
                    "How do you handle performance bottlenecks or errors in your projects?"
                ]
            }
        else:
            raise HTTPException(status_code=404, detail=f"Target role '{req.target_role}' not found.")

    user_answers = [msg for msg in req.history if msg.role == "user"]
    num_answers = len(user_answers)
    logger.info(f"Interview Turn Resolved. target_role: '{req.target_role}', history length: {len(req.history)}, num_answers: {num_answers}")

    # Initialize Interview
    if num_answers == 0:
        system_prompt = (
            f"You are a friendly but professional technical interviewer for the '{req.target_role}' position.\n"
            "Your job is to conduct a short 5-question mock interview. "
            f"You MUST start your response exactly with the phrase: 'Welcome! Let's begin the mock interview for the {req.target_role} position.' followed by your first question.\n"
            "Typical questions for this role are: " + ", ".join(role_data["typical_interview_questions"]) + "\n"
            f"{skills_context}"
            "Keep the question clear, direct, and tailored to the target role. "
            "Do not output anything except the welcome phrase and the first question."
        )
        try:
            start_time = time.time()
            first_q = call_llm_raw("Start the mock interview.", system_prompt=system_prompt)
            duration = time.time() - start_time
            logger.info(f"LLM interview turn (initialize) completed in {duration:.2f}s")
            
            return InterviewTurnResponse(
                next_message=first_q.strip(),
                is_final=False,
                feedback=None
            )
        except Exception as e:
            logger.error(f"Error starting interview: {str(e)}")
            handle_llm_exception(e, "interview starting")

    # Final Summary Evaluation Turn
    elif num_answers >= 5:
        # User has finished answering 5 questions. Evaluate history and output final feedback
        system_prompt = (
            f"You are a senior tech lead conducting a performance evaluation for a mock interview for the '{req.target_role}' role.\n"
            "Review the conversation history and the user's answers. "
            f"{skills_context}"
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
            start_time = time.time()
            parsed_json = call_llm_json(history_text, system_prompt=system_prompt)
            duration = time.time() - start_time
            logger.info(f"LLM interview turn (evaluation) completed in {duration:.2f}s")
            
            return InterviewTurnResponse(
                next_message=parsed_json.get("next_message", "Evaluation summary not available."),
                is_final=True,
                feedback=parsed_json.get("feedback")
            )
        except Exception as e:
            logger.error(f"Error finishing interview: {str(e)}")
            handle_llm_exception(e, "interview evaluation")

    # Mid-Interview Turns (Questions 2 through 5)
    else:
        # 1 to 4 answers have been submitted. Analyze the last answer and ask the next question
        user_last_msg = user_answers[-1].content
        pivot_topic = detect_meta_request(user_last_msg)
        
        if pivot_topic:
            # Pivot Intent Detected: Acknowledge the user's meta-request and focus the next question on it
            logger.info(f"Pivot intent detected! User requested to focus on: '{pivot_topic}'")
            system_prompt = (
                f"You are a friendly but professional technical interviewer for the '{req.target_role}' position.\n"
                "You are conducting a short 5-question mock interview. "
                f"The candidate has answered {num_answers} question(s) out of 5.\n"
                f"The candidate has explicitly asked to focus on or redirect the interview to: '{pivot_topic}'.\n"
                f"Acknowledge their request politely (e.g. 'Acknowledged. Let's pivot to focus on {pivot_topic}...').\n"
                f"Ask the next technical interview question specifically targeting: '{pivot_topic}'.\n"
                "Do not grade or criticize their message as a wrong answer; treat it purely as a redirect request.\n"
                f"{skills_context}"
                "Your response must be a valid JSON object matching this schema exactly:\n"
                "{\n"
                "  \"feedback\": \"Acknowledge the user's request to focus on the new topic.\",\n"
                "  \"next_message\": \"The next interview question about the new topic...\",\n"
                "  \"is_final\": false\n"
                "}\n"
                "Do not include any preambles, explanations, or code fences."
            )
        else:
            # Standard answer analysis
            system_prompt = (
                f"You are a friendly but professional technical interviewer for the '{req.target_role}' position.\n"
                "You are conducting a short 5-question mock interview. "
                f"The candidate has answered {num_answers} question(s) out of 5.\n"
                "Analyze the candidate's last answer and provide brief feedback (1-2 sentences) on what was good or how to improve.\n"
                "Then, ask the next question (Question number {num_answers + 1}).\n"
                f"{skills_context}"
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
            start_time = time.time()
            parsed_json = call_llm_json(history_text, system_prompt=system_prompt)
            duration = time.time() - start_time
            logger.info(f"LLM interview turn (next question) completed in {duration:.2f}s")
            
            return InterviewTurnResponse(
                next_message=parsed_json.get("next_message", "Next question could not be generated."),
                is_final=False,
                feedback=parsed_json.get("feedback")
            )
        except Exception as e:
            logger.error(f"Error during mid-interview turn: {str(e)}")
            handle_llm_exception(e, "interview next turn generation")
