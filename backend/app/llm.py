import os
import time
import json
import re
import logging
from dotenv import load_dotenv
from anthropic import Anthropic, APIError

from typing import Optional

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variable from .env file if it exists
load_dotenv()

def detect_meta_request(message: str) -> Optional[str]:
    """
    Detects if the user's message is an explicit redirect/meta-request.
    Returns the target topic if detected, otherwise None.
    """
    msg_lower = message.lower().strip()
    
    # Common meta-request patterns
    patterns = [
        r"ask me about (?:the )?([\w\s\+\#]+)",
        r"focus on ([\w\s\+\#]+)",
        r"can we talk about ([\w\s\+\#]+)",
        r"can we focus on ([\w\s\+\#]+)",
        r"change topic to ([\w\s\+\#]+)",
        r"talk about ([\w\s\+\#]+)"
    ]
    
    for pat in patterns:
        m = re.search(pat, msg_lower)
        if m:
            return m.group(1).strip()
            
    # Phrases indicating a request to pivot or skip
    if any(phrase in msg_lower for phrase in ["skip this", "ask something else", "don't know, ask", "i don't know, ask"]):
        return "another technical topic related to the role"
        
    return None

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

def load_skill_taxonomy() -> dict:
    """
    Loads the taxonomy JSON mapping standard skills to search patterns.
    """
    try:
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        taxonomy_file = os.path.join(base_dir, "data", "skill_taxonomy.json")
        if os.path.exists(taxonomy_file):
            with open(taxonomy_file, "r") as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Error loading skill taxonomy: {str(e)}")
    return {}

def extract_skills_from_text_via_taxonomy(text: str) -> list:
    """
    Performs regex search against the taxonomy definitions to extract skills.
    """
    taxonomy = load_skill_taxonomy()
    found_skills = []
    if not taxonomy:
        return found_skills
        
    for category, skills in taxonomy.items():
        for skill_name, patterns in skills.items():
            for pattern in patterns:
                # Compile regex with word boundaries if appropriate
                regex_pattern = pattern if "\\" in pattern or "\\b" in pattern else rf"\b{pattern}\b"
                
                # Case sensitivity override for single-letter language "R" to prevent false positives
                flags = 0 if skill_name == "R" else re.IGNORECASE
                
                if re.search(regex_pattern, text, flags):
                    found_skills.append(skill_name)
                    break
    return list(set(found_skills))

def generate_mock_llm_response(prompt: str, system_prompt: str = None, is_json: bool = False) -> str:
    """
    Generates intelligent mock responses matching the expected schemas when the live LLM API is unavailable.
    """
    system_prompt = system_prompt or ""
    prompt = prompt or ""
    
    # 1. Resume Skills Extraction
    if "Resume Parser" in system_prompt or "extract-skills" in prompt or "extract_skills" in prompt or "extract skills" in system_prompt.lower():
        found_skills = extract_skills_from_text_via_taxonomy(prompt)
        if not found_skills:
            found_skills = ["Python", "SQL", "Excel", "HTML", "CSS"]
            
        projects = []
        project_matches = re.findall(r"-\s*([^\n]+)", prompt)
        for pm in project_matches:
            pm_lower = pm.lower()
            if any(term in pm_lower for term in ["project", "dashboard", "webpage", "app", "system", "ocr", "rag", "ml", "autonomous", "classifier", "detector", "vision"]):
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
        role_match = re.search(r"Target Role:\s*([^\n]+)", prompt) or re.search(r"Title:\s*([^\n]+)", prompt)
        if role_match:
            target_role = role_match.group(1).strip()
            
        is_custom = "inferred" in system_prompt.lower() or target_role.lower() in ["other", "other (custom)", "custom"] or target_role.startswith("Other")
        
        required = []
        nice_to_have = []
        
        if is_custom:
            role_clean = target_role.replace("Other (custom) - ", "").strip()
            if any(term in role_clean.lower() for term in ["reliability", "sre", "infrastructure", "systems engineer"]):
                required = ["Kubernetes", "Linux", "Docker", "Go", "Bash"]
                nice_to_have = ["Terraform", "Prometheus", "CI/CD"]
            elif any(term in role_clean.lower() for term in ["product manager", "pm"]):
                required = ["Product Roadmap", "SQL", "Market Research", "Agile", "User Stories"]
                nice_to_have = ["Jira", "A/B Testing", "Data Analysis"]
            else:
                required = [f"{role_clean} Core", "System Architecture", "Problem Solving", "Communication", "Technical Design"]
                nice_to_have = ["Docker", "Git", "Project Management"]
        else:
            # Parse required and nice to have lists from prompt to ensure 100% strict classification
            required_match = re.search(r"Required Skills[^:]*:\s*\[(.*?)\]", prompt)
            nice_match = re.search(r"Nice To Have Skills[^:]*:\s*\[(.*?)\]", prompt)
            
            if required_match:
                required = [s.strip().strip("'\"") for s in required_match.group(1).split(",") if s.strip()]
            if not required:
                required = ["SQL", "Python", "Data Visualization", "Excel", "Statistics"]
                
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
            elif s.lower() in ["data visualization", "pandas", "tableau", "excel", "git", "docker"] and any(u.lower() in ["python", "sql", "excel"] for u in user_skills):
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
        if is_custom:
            summary += " Note: This is an AI-inferred estimate because a custom role was selected."
        
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
    elif "performance evaluation" in system_prompt or "Scorecard" in system_prompt or '"is_final": true' in system_prompt or '"is_final":true' in system_prompt.replace(" ", ""):
        scorecard = "### Mock Interview Scorecard\n\n**Strengths:**\n- Good understanding of core concepts.\n- Clear communication and structured reasoning.\n\n**Weaknesses/Gaps:**\n- Could expand more on design patterns and architectural tradeoffs.\n\n**Actionable Tips:**\n- Study system design patterns and practice mock coding problems."
        resp = {
            "feedback": "Overall solid performance in answering the mock interview questions.",
            "next_message": scorecard,
            "is_final": True
        }
        return json.dumps(resp) if is_json else scorecard

    # 5. Mid-interview Turn
    elif "Mock Interview" in system_prompt or "conduct a short 5-question" in system_prompt or "interview" in system_prompt:
        target_role = "Data Analyst"
        role_match = re.search(r"for the '([^']+)' position", system_prompt) or re.search(r"role '([^']+)'", system_prompt) or re.search(r"interview for the '([^']+)'", system_prompt)
        if role_match:
            target_role = role_match.group(1)

        # Check if this is the start turn
        if "Start the mock interview." in prompt:
            first_q = f"Welcome! Let's begin the mock interview for the {target_role} position. Can you explain the difference between a LEFT JOIN and an INNER JOIN in SQL, and when you would prefer one over the other?"
            if any(term in target_role.lower() for term in ["machine learning", "ml", "data scientist", "data science", "computer vision", "nlp", "researcher"]):
                first_q = f"Welcome! Let's begin the mock interview for the {target_role} position. Can you explain the difference between overfitting and underfitting in Machine Learning, and how you would prevent overfitting?"
            
            resp = {
                "feedback": None,
                "next_message": first_q,
                "is_final": False
            }
            return json.dumps(resp) if is_json else first_q
            
        num_answers = prompt.count("USER:")
        
        # Extract last answer
        last_answer = ""
        user_turns = [line.split("USER:", 1)[1].strip() for line in prompt.split("\n") if "USER:" in line]
        if user_turns:
            last_answer = user_turns[-1]

        # Intent Detection: check for meta-redirect request
        pivot_topic = detect_meta_request(last_answer)
        if pivot_topic:
            feedback = f"Acknowledged. Let's pivot to focus on your requested topic: {pivot_topic}."
            pivot_lower = pivot_topic.lower()
            if "python" in pivot_lower:
                next_q = "Understood! Let's talk about Python. Can you explain the difference between list comprehensions and generators in Python, and when you would choose one over the other?"
            elif "ml" in pivot_lower or "machine learning" in pivot_lower or "overfitting" in pivot_lower:
                next_q = "No problem! Let's focus on Machine Learning. Can you explain how cross-validation works and why it is crucial for model evaluation?"
            elif "rag" in pivot_lower or "vector" in pivot_lower:
                next_q = "Sure! Let's focus on Retrieval-Augmented Generation (RAG). Can you explain how document chunking and vector embeddings impact search retrieval accuracy?"
            else:
                next_q = f"Sure! Let's focus on {pivot_topic}. Can you describe a key concept or standard tool you use when working with {pivot_topic}?"
                
            resp = {
                "feedback": feedback,
                "next_message": next_q,
                "is_final": False
            }
            return json.dumps(resp) if is_json else next_q

        # Determine feedback based on standard questions answered
        feedback = "Great answer! You showed good clarity and covered the key aspects of the question."
        last_answer_lower = last_answer.lower()
        
        if num_answers == 1:
            # User answered Question 1: LEFT JOIN vs INNER JOIN or Overfitting vs Underfitting
            if any(w in last_answer_lower for w in ["don't know", "dont know", "no idea", "unsure", "not sure", "skip"]):
                if "overfit" in prompt.lower():
                    feedback = "It seems you're unsure. Overfitting happens when a model learns training data noise too well and fails to generalize; underfitting is when the model is too simple. You can prevent overfitting using regularization, dropout, or more data."
                else:
                    feedback = "It seems you're unsure about this topic. A LEFT JOIN returns all rows from the left table plus matching rows from the right, whereas an INNER JOIN only returns rows that have matching values in both tables."
            elif "overfit" in prompt.lower():
                if any(w in last_answer_lower for w in ["generalize", "noise", "regularization", "dropout", "data", "test", "train"]):
                    feedback = "Good explanation of model generalization and techniques to prevent overfitting (like regularization or dropout)."
                else:
                    feedback = "Overfitting is when a model fits the training set too closely; underfitting is failing to capture the underlying pattern. Try using regularization to improve generalization."
            else:
                if any(w in last_answer_lower for w in ["left", "inner", "join", "table", "match"]):
                    feedback = "Good explanation of the difference! You correctly noted how LEFT JOIN preserves unmatched rows from the left table while INNER JOIN only keeps matching rows."
                else:
                    feedback = "A SQL join combines rows from tables. Try to review how LEFT JOIN returns all left-table rows, whereas INNER JOIN requires a match on both sides."
                
        elif num_answers == 2:
            # User answered Question 2: SQL vs NoSQL
            if any(w in last_answer_lower for w in ["don't know", "dont know", "no idea", "unsure", "not sure", "skip"]):
                feedback = "SQL databases are relational and structured (e.g. PostgreSQL), while NoSQL databases are non-relational and schema-less (e.g. MongoDB). Your answer did not highlight this difference."
            elif any(w in last_answer_lower for w in ["relation", "table", "schema", "document", "sql", "nosql", "mongo"]):
                feedback = "Excellent summary of SQL vs NoSQL! You correctly identified the relational, schema-bound nature of SQL compared to the flexible, document-based structure of NoSQL."
            else:
                feedback = "A key difference is that SQL databases are relational and structured, whereas NoSQL databases are non-relational and schema-less. Consider revising these database models."
                
        elif num_answers == 3:
            # User answered Question 3: Concurrency / Async
            if any(w in last_answer_lower for w in ["don't know", "dont know", "no idea", "unsure", "not sure", "skip"]):
                feedback = "Concurrency is important for performance. In Python, this is typically handled via async/await, threading, or multiprocessing. Let's practice implementing these concepts."
            elif any(w in last_answer_lower for w in ["async", "await", "thread", "process", "lock", "concurrency", "promise", "callback"]):
                feedback = "Great response! You showed good familiarity with concurrency mechanisms and how asynchronous operations prevent blocking tasks."
            else:
                feedback = "Make sure to review async programming patterns, such as threads, processes, or async/await syntax, which are vital for non-blocking I/O operations."
                
        elif num_answers == 4:
            # User answered Question 4: Clean code and testing
            if any(w in last_answer_lower for w in ["don't know", "dont know", "no idea", "unsure", "not sure", "skip"]):
                feedback = "Writing maintainable code involves using clean principles (like SOLID) and testing libraries (like pytest or unittest). This is a crucial skill to master."
            elif any(w in last_answer_lower for w in ["clean", "pytest", "test", "lint", "solid", "dry", "format", "git", "unittest"]):
                feedback = "Solid response! Emphasizing readability, modular design, and standard testing libraries like pytest is key to production-grade engineering."
            else:
                feedback = "Good practices include writing modular functions, following standard style guides (like PEP 8), and using testing frameworks (like pytest) to ensure code reliability."
                
        elif num_answers == 5:
            # User answered Question 5: Questions/Project
            feedback = "Thank you for sharing your experience and highlighting your project interests. Let's move on to the evaluation."

        next_q = f"Question {num_answers + 1}: Can you describe a challenging technical problem you solved recently and how you approached it?"
        if num_answers == 1:
            next_q = "Question 2: How would you describe the difference between a SQL and NoSQL database, and when would you use each?"
            if "overfit" in prompt.lower():
                next_q = "Question 2: In Machine Learning, what is the bias-variance tradeoff, and how does it relate to overfitting and underfitting?"
        elif num_answers == 2:
            next_q = "Question 3: Can you explain how you handle concurrency or asynchronous tasks in your favorite programming language?"
            if "overfit" in prompt.lower():
                next_q = "Question 3: Can you explain the difference between L1 (Lasso) and L2 (Ridge) regularization, and how they prevent overfitting?"
        elif num_answers == 3:
            next_q = "Question 4: What is your approach to writing clean, maintainable code, and what tools do you use for testing?"
        elif num_answers == 4:
            next_q = "Question 5: Do you have any questions for us, or is there any specific project you'd like to highlight?"
            
        resp = {
            "feedback": feedback,
            "next_message": next_q,
            "is_final": False
        }
        return json.dumps(resp) if is_json else next_q
        
    target_role = "Data Analyst"
    role_match = re.search(r"for the '([^']+)' position", system_prompt) or re.search(r"role '([^']+)'", system_prompt)
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
