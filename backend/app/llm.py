import os
import time
import json
import re
import logging
from dotenv import load_dotenv
from anthropic import Anthropic, APIError

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variable from .env file if it exists
load_dotenv()

# Verify API key availability
# Verify API key availability
API_KEY = os.environ.get("ANTHROPIC_API_KEY")
if not API_KEY:
    logger.warning(
        "WARNING: ANTHROPIC_API_KEY environment variable is not set. "
        "Falling back to Mock LLM mode."
    )
    API_KEY = "mock_key_for_fallback"

# Initialize Client
try:
    client = Anthropic(api_key=API_KEY)
except Exception as e:
    logger.warning(f"Failed to initialize Anthropic client: {str(e)}. Mock LLM mode will be used.")
    client = None

DEFAULT_MODEL = "claude-3-5-sonnet-20241022"

def clean_json_text(text: str) -> str:
    """
    Cleans markdown code fences and extraneous text from LLM JSON responses.
    """
    text = text.strip()
    # Find block formatted as ```json ... ```
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        return match.group(1).strip()
    return text

def generate_mock_llm_response(prompt: str, system_prompt: str = None, is_json: bool = False) -> str:
    """
    Generates intelligent mock responses matching the expected schemas when the live LLM API is unavailable.
    """
    system_prompt = system_prompt or ""
    prompt = prompt or ""
    
    # 1. Resume Skills Extraction
    if "Resume Parser" in system_prompt or "extract-skills" in prompt or "extract_skills" in prompt or "extract skills" in system_prompt.lower():
        found_skills = []
        possible_skills = ["Python", "SQL", "React", "Excel", "HTML", "CSS", "Java", "C++", "JavaScript", "Statistics", "A/B Testing", "Tableau", "PowerBI", "Docker", "Kubernetes", "Git"]
        for s in possible_skills:
            if re.search(rf"\b{s}\b", prompt, re.IGNORECASE):
                found_skills.append(s)
        if not found_skills:
            found_skills = ["Python", "SQL", "Excel", "HTML", "CSS"]
            
        projects = []
        project_matches = re.findall(r"-\s*([^\n]+)", prompt)
        for pm in project_matches:
            if "project" in pm.lower() or "dashboard" in pm.lower() or "webpage" in pm.lower() or "app" in pm.lower() or "system" in pm.lower():
                projects.append(pm.strip())
        if not projects:
            projects = ["Inventory management dashboard", "Personal portfolio webpage"]
            
        exp_level = "Entry-level"
        if re.search(r"\b(student|fresher)\b", prompt, re.IGNORECASE):
            exp_level = "Student"
        elif re.search(r"\b(senior|lead|manager)\b", prompt, re.IGNORECASE):
            exp_level = "Senior"
        elif re.search(r"\b(mid|experienced|3\+ years|4\+ years|5\+ years)\b", prompt, re.IGNORECASE):
            exp_level = "Mid-level"
            
        resp = {
            "skills": found_skills,
            "projects": projects,
            "experience_level": exp_level
        }
        return json.dumps(resp) if is_json else f"Extracted Skills: {', '.join(found_skills)}"

    # 2. Skill Gap Analysis
    elif "Career Advisor" in system_prompt or "gap analysis" in prompt or "gap_analysis" in prompt:
        user_skills = []
        skills_match = re.search(r"User Current Skills:\s*(?:\[(.*?)\]|([^\n]+))", prompt)
        if skills_match:
            skills_str = skills_match.group(1) or skills_match.group(2)
            user_skills = [s.strip().strip("'\"[]") for s in skills_str.split(",") if s.strip()]
        else:
            user_skills = ["Python", "SQL", "Excel"]
            
        target_role = "Data Analyst"
        role_match = re.search(r"Title:\s*([^\n]+)", prompt)
        if role_match:
            target_role = role_match.group(1).strip()
            
        # Parse required and nice to have lists from prompt to ensure 100% strict classification
        required_match = re.search(r"Required Skills[^:]*:\s*\[(.*?)\]", prompt)
        nice_match = re.search(r"Nice To Have Skills[^:]*:\s*\[(.*?)\]", prompt)
        
        required = []
        if required_match:
            required = [s.strip().strip("'\"") for s in required_match.group(1).split(",") if s.strip()]
        if not required:
            required = ["SQL", "Python", "Data Visualization", "Excel", "Statistics"]
            
        nice_to_have = []
        if nice_match:
            nice_to_have = [s.strip().strip("'\"") for s in nice_match.group(1).split(",") if s.strip()]
        if not nice_to_have:
            nice_to_have = ["Tableau", "PowerBI", "A/B Testing", "Pandas", "R"]
            
        all_skills = required + nice_to_have
        matched = []
        partial = []
        missing = []
        
        for s in all_skills:
            if any(s.lower() == u.lower() for u in user_skills):
                matched.append(s)
            elif s.lower() in ["data visualization", "pandas", "tableau", "excel"] and any(u.lower() in ["python", "sql", "excel"] for u in user_skills):
                partial.append(s)
            else:
                missing.append(s)
                
        # Generate reasoning dict for each skill
        reasoning = {}
        for s in all_skills:
            if s in matched:
                reasoning[s] = f"Candidate's profile shows strong matching experience and mentions '{s}'."
            elif s in partial:
                reasoning[s] = f"Candidate has some exposure related to '{s}' but requires deeper practical knowledge."
            else:
                reasoning[s] = f"'{s}' was not found in the candidate's resume, representing a core skill gap."
                
        match_pct = max(10.0, min(95.0, (len([s for s in required if s in matched]) / max(1, len(required))) * 100))
        match_pct = round(match_pct, 1)
        
        summary = f"The candidate has strong foundational skills matching the {target_role} role (namely {', '.join(matched) if matched else 'none'}). However, there are gaps in core areas: {', '.join(missing)}."
        
        resp = {
            "matched_skills": matched,
            "matched": matched,
            "missing_skills": missing,
            "missing": missing,
            "partial_skills": partial,
            "partial": partial,
            "match_percentage": match_pct,
            "match_pct": match_pct,
            "summary_text": summary,
            "summary": summary,
            "reasoning": reasoning
        }
        return json.dumps(resp) if is_json else summary

    # 3. Learning Path Generation
    elif "curriculum designer" in system_prompt or "learning-path" in prompt or "learning_path" in prompt:
        missing_skills = []
        missing_match = re.search(r"Missing Skills:\s*\[(.*?)\]", prompt)
        if missing_match:
            missing_skills = [s.strip().strip("'\"") for s in missing_match.group(1).split(",") if s.strip()]
        if not missing_skills:
            missing_skills = ["Statistics", "A/B Testing"]
            
        roadmap = []
        for s in missing_skills:
            # Generate clean resources
            url_map = {
                "python": "https://docs.python.org/3/",
                "sql": "https://www.khanacademy.org/computing/computer-programming/sql",
                "react": "https://react.dev",
                "excel": "https://support.microsoft.com/en-us/excel",
                "html": "https://developer.mozilla.org/en-US/docs/Web/HTML",
                "css": "https://developer.mozilla.org/en-US/docs/Web/CSS",
                "statistics": "https://www.khanacademy.org/math/statistics-probability",
                "a/b testing": "https://www.google.com/search?q=A/B+Testing+freeCodeCamp",
                "tableau": "https://help.tableau.com/current/pro/desktop/en-us/default.htm"
            }
            url1 = url_map.get(s.lower(), f"https://www.google.com/search?q={s.replace(' ', '+')}+official+documentation")
            url2 = f"https://www.google.com/search?q=freeCodeCamp+{s.replace(' ', '+')}+course"
            
            roadmap.append({
                "skill": s,
                "why_it_matters": f"Essential skill for core requirements and tasks associated with this role.",
                "learning_time": "2 weeks",
                "resources": [
                    {"label": f"Official {s} Documentation", "url": url1},
                    {"label": f"freeCodeCamp {s} Course", "url": url2}
                ]
            })
            
        return json.dumps({"roadmap": roadmap}) if is_json else f"Roadmap for: {', '.join(missing_skills)}"

    # 4. Final Interview Scorecard
    elif "performance evaluation" in system_prompt or "Scorecard" in system_prompt or "is_final" in system_prompt or "is_final\": true" in system_prompt:
        scorecard = "### Mock Interview Scorecard\n\n**Strengths:**\n- Good understanding of core concepts.\n- Clear communication and structured reasoning.\n\n**Weaknesses/Gaps:**\n- Could expand more on design patterns and architectural tradeoffs.\n\n**Actionable Tips:**\n- Study system design patterns and practice mock coding problems."
        resp = {
            "feedback": "Overall solid performance in answering the mock interview questions.",
            "next_message": scorecard,
            "is_final": True
        }
        return json.dumps(resp) if is_json else scorecard

    # 5. Mid-interview Turn
    elif "Mock Interview" in system_prompt or "conduct a short 5-question" in system_prompt or "interview" in system_prompt:
        # Check if this is the start turn
        if "Start the mock interview." in prompt:
            target_role = "Data Analyst"
            role_match = re.search(r"interview for the '([^']+)'", system_prompt) or re.search(r"position '([^']+)'", system_prompt)
            if role_match:
                target_role = role_match.group(1)
            
            first_q = f"Welcome! Let's begin the mock interview for the {target_role} position. Can you explain the difference between a LEFT JOIN and an INNER JOIN in SQL, and when you would prefer one over the other?"
            resp = {
                "feedback": None,
                "next_message": first_q,
                "is_final": False
            }
            return json.dumps(resp) if is_json else first_q
            
        num_answers = prompt.count("USER:")
        next_q = f"Question {num_answers + 1}: Can you describe a challenging technical problem you solved recently and how you approached it?"
        if num_answers == 1:
            next_q = "Question 2: How would you describe the difference between a SQL and NoSQL database, and when would you use each?"
        elif num_answers == 2:
            next_q = "Question 3: Can you explain how you handle concurrency or asynchronous tasks in your favorite programming language?"
        elif num_answers == 3:
            next_q = "Question 4: What is your approach to writing clean, maintainable code, and what tools do you use for testing?"
        elif num_answers == 4:
            next_q = "Question 5: Do you have any questions for us, or is there any specific project you'd like to highlight?"
            
        resp = {
            "feedback": "Great answer! You showed good clarity and covered the key aspects of the question.",
            "next_message": next_q,
            "is_final": False
        }
        return json.dumps(resp) if is_json else next_q
        
    target_role = "Data Analyst"
    role_match = re.search(r"role '([^']+)'", system_prompt)
    if role_match:
        target_role = role_match.group(1)
    
    return f"Welcome! Let's begin the mock interview for the {target_role} position. Can you explain your experience with the core skills required for this role?"

def call_llm_raw(prompt: str, system_prompt: str = None) -> str:
    """
    Low-level call to Anthropic Claude with retry logic and exponential backoff (3 attempts).
    """
    is_json = False
    if system_prompt and "json" in system_prompt.lower():
        is_json = True
    elif "json" in prompt.lower():
        is_json = True

    if not client or not API_KEY or "sk-ant" not in API_KEY:
        logger.warning("No valid live ANTHROPIC_API_KEY configured. Falling back to mock generator.")
        return generate_mock_llm_response(prompt, system_prompt, is_json=is_json)

    max_retries = 3
    base_delay = 2.0  # seconds

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"LLM API Call - Attempt {attempt}/{max_retries}")
            
            messages = [{"role": "user", "content": prompt}]
            
            kwargs = {
                "model": DEFAULT_MODEL,
                "max_tokens": 4000,
                "messages": messages
            }
            if system_prompt:
                kwargs["system"] = system_prompt
                
            response = client.messages.create(**kwargs)
            
            if response.content and len(response.content) > 0:
                return response.content[0].text
            else:
                raise APIError("Empty response content from Anthropic API", request=None)
                
        except Exception as e:
            err_msg = str(e)
            logger.warning(f"Attempt {attempt} failed with error: {err_msg}")
            
            # Fail fast on billing, credit or auth issues
            if any(term in err_msg.lower() for term in ["credit", "balance", "api_key", "auth", "401", "403", "400"]):
                logger.warning(f"Billing/Auth or request error detected: {err_msg}. Falling back to mock generator.")
                return generate_mock_llm_response(prompt, system_prompt, is_json=is_json)

            if attempt == max_retries:
                logger.error("All retries exhausted. Falling back to mock generator.")
                return generate_mock_llm_response(prompt, system_prompt, is_json=is_json)
                
            delay = base_delay * (2 ** (attempt - 1))
            logger.info(f"Waiting {delay}s before retrying...")
            time.sleep(delay)

def call_llm_json(prompt: str, system_prompt: str = None) -> dict:
    """
    Calls LLM and returns parsed JSON dictionary. Employs regex recovery if standard JSON parse fails.
    """
    try:
        raw_response = call_llm_raw(prompt, system_prompt=system_prompt)
        cleaned = clean_json_text(raw_response)
        
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError as e:
            logger.warning(f"Initial JSON decode failed: {str(e)}. Attempting advanced regex fallback.")
            # Try to locate the first '{' and last '}'
            start = cleaned.find('{')
            end = cleaned.rfind('}')
            if start != -1 and end != -1 and end > start:
                substring = cleaned[start:end+1]
                try:
                    return json.loads(substring)
                except json.JSONDecodeError:
                    pass
            
            # If it's a JSON array response
            start_arr = cleaned.find('[')
            end_arr = cleaned.rfind(']')
            if start_arr != -1 and end_arr != -1 and end_arr > start_arr:
                substring_arr = cleaned[start_arr:end_arr+1]
                try:
                    return json.loads(substring_arr)
                except json.JSONDecodeError:
                    pass
                    
            # If all else fails, return raw string wrapped in a dict or raise
            logger.error("Could not parse LLM output as JSON.")
            logger.error(f"Raw output was:\n{raw_response}")
            raise ValueError("Failed to extract valid JSON structure from LLM response.")
    except Exception as e:
        logger.warning(f"JSON LLM generation failed: {str(e)}. Falling back to direct JSON mock generation.")
        mock_raw = generate_mock_llm_response(prompt, system_prompt, is_json=True)
        return json.loads(mock_raw)
