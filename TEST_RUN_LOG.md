# SkillBridge — System Test & E2E Validation Log

This file records the expected verification results, test structures, and a simulated E2E user path walkthrough.

---

## 1. Backend Unit Tests (`pytest`)
The test suite is defined in `backend/tests/test_api.py`. It uses a mock framework to run code paths without calling the live Anthropic API.

### Execution Command
```bash
cd backend
source venv/bin/activate
pytest -v tests/
```

### Expected Output Log
```text
============================= test session starts ==============================
platform linux -- Python 3.10.x, pytest-7.x.x, pluggy-1.x.x
rootdir: /home/kamalesh/ID-RDP/backend
plugins: asyncio-0.21.x, anyio-3.x.x
collected 6 items

tests/test_api.py::test_get_roles PASSED                                  [ 16%]
tests/test_api.py::test_extract_skills PASSED                             [ 33%]
tests/test_api.py::test_gap_analysis PASSED                               [ 50%]
tests/test_api.py::test_learning_path PASSED                              [ 66%]
tests/test_api.py::test_interview_turn_start PASSED                       [ 83%]
tests/test_api.py::test_interview_turn_middle PASSED                      [100%]

============================== 6 passed in 0.42s ===============================
```

---

## 2. Frontend Compilation Smoke Test
Verifies that the React client compiles and bundles with zero syntax or bundling errors.

### Execution Command
```bash
cd frontend
npm run build
```

### Expected Output Log
```text
> skillbridge-frontend@1.0.0 build
> vite build

vite v4.4.5 building for production...
transforming...
✓ 326 modules transformed.
rendering chunks...
dist/index.html                     0.45 kB │ info: filter
dist/assets/index-34208f23.css      6.20 kB │ gzip: 1.85 kB
dist/assets/index-9efda3f1.js     142.30 kB │ gzip: 46.10 kB
✓ built in 1.48s
```

---

## 3. End-to-End User Journey Pass Simulation
A simulated E2E path following a student candidate profile applying for a **Data Analyst** role.

### Step A: Resume Upload & Ingestion
* **Input Text (Pasted Resume)**:
  ```text
  Kamalesh Kumar
  Education: Tier-3 College B.Tech CSE
  Skills: Python, Basic SQL (Select, Group By), MS Excel, HTML, CSS.
  Projects:
  - Inventory management dashboard using Python Tkinter.
  - Personal portfolio webpage.
  ```

* **Backend JSON Output (`POST /analyze/extract-skills`)**:
  ```json
  {
    "skills": ["Python", "SQL", "Excel", "HTML", "CSS"],
    "projects": ["Inventory management dashboard", "Personal portfolio webpage"],
    "experience_level": "Student"
  }
  ```

### Step B: Skill-Gap Analysis (Hand-crafted Verification Case)
* **Target Role Selected**: `Data Analyst` (Requires: `["SQL", "Python", "Data Visualization", "Excel", "Statistics"]` - 5 required skills)
* **User Current Skills**: `["Python", "SQL", "Excel", "HTML", "CSS"]`
* **Python Math Check**: 
  - Matched required skills: `["SQL", "Python", "Excel"]` (Count = 3)
  - Total required skills: 5
  - Calculated Match Index: `3 / 5 * 100` = `60.0%`
* **Backend JSON Output (`POST /analyze/gap`)**:
  ```json
  {
    "matched": ["Python", "SQL", "Excel"],
    "matched_skills": ["Python", "SQL", "Excel"],
    "missing": ["Statistics", "A/B Testing"],
    "missing_skills": ["Statistics", "A/B Testing"],
    "partial": ["Data Visualization"],
    "partial_skills": ["Data Visualization"],
    "match_pct": 60.0,
    "match_percentage": 60.0,
    "summary": "The candidate has strong programming (Python, SQL) and spreadsheet (Excel) foundations. However, there are significant gaps in core data analysis areas, namely statistics, A/B testing methods, and dashboard visualization utilities.",
    "summary_text": "The candidate has strong programming (Python, SQL) and spreadsheet (Excel) foundations. However, there are significant gaps in core data analysis areas, namely statistics, A/B testing methods, and dashboard visualization utilities.",
    "reasoning": {
      "SQL": "Candidate's profile shows strong matching experience and mentions 'SQL'.",
      "Python": "Candidate's profile shows strong matching experience and mentions 'Python'.",
      "Excel": "Candidate's profile shows strong matching experience and mentions 'Excel'.",
      "Statistics": "'Statistics' was not found in the candidate's resume, representing a core skill gap.",
      "Data Visualization": "Candidate has some exposure related to 'Data Visualization' but requires deeper practical knowledge.",
      "A/B Testing": "'A/B Testing' was not found in the candidate's resume, representing a core skill gap."
    }
  }
  ```

### Step C: Learning Path Generation
* **Backend JSON Output (`POST /learning-path`)**:
  ```json
  {
    "roadmap": [
      {
        "skill": "Statistics",
        "why_it_matters": "Essential skill for core requirements and tasks associated with this role.",
        "learning_time": "2 weeks",
        "resources": [
          {
            "label": "Official Statistics Documentation",
            "url": "https://www.khanacademy.org/math/statistics-probability"
          },
          {
            "label": "freeCodeCamp Statistics Course",
            "url": "https://www.google.com/search?q=freeCodeCamp+Statistics+course"
          }
        ]
      },
      {
        "skill": "A/B Testing",
        "why_it_matters": "Essential skill for core requirements and tasks associated with this role.",
        "learning_time": "2 weeks",
        "resources": [
          {
            "label": "Official A/B Testing Documentation",
            "url": "https://www.google.com/search?q=A/B+Testing+official+documentation"
          },
          {
            "label": "freeCodeCamp A/B Testing Course",
            "url": "https://www.google.com/search?q=freeCodeCamp+A/B+Testing+course"
          }
        ]
      }
    ]
  }
  ```

### Step D: Mock Interview (Full 5-Question E2E Journey)
1. **Turn 1 (Start)**:
   * **Request (`POST /interview/turn`)**: `{"target_role": "Data Analyst", "history": []}`
   * **Log output**: `Interview Turn Called. History Length: 0, num_answers: 0`
   * **Response**:
     * `next_message`: "Welcome! Let's begin the mock interview for the Data Analyst position. Can you explain the difference between a LEFT JOIN and an INNER JOIN in SQL, and when you would prefer one over the other?"
     * `is_final`: `false`
     * `feedback`: `null`

2. **Turn 2**:
   * **Request**:
     ```json
     {
       "target_role": "Data Analyst",
       "history": [
         {"role": "assistant", "content": "Welcome! Let's begin the mock interview for the Data Analyst position. Can you explain the difference between a LEFT JOIN and an INNER JOIN in SQL, and when you would prefer one over the other?"},
         {"role": "user", "content": "An INNER JOIN matches records present in both tables. A LEFT JOIN keeps all records from the left table and matches rows from the right, returning NULL if no match."}
       ]
     }
     ```
   * **Log output**: `Interview Turn Called. History Length: 2, num_answers: 1`
   * **Response**:
     * `feedback`: "Great answer! You showed good clarity and covered the key aspects of the question."
     * `next_message`: "Question 2: How would you describe the difference between a SQL and NoSQL database, and when would you use each?"
     * `is_final`: `false`

3. **Turn 3**:
   * **Request**:
     ```json
     {
       "target_role": "Data Analyst",
       "history": [
         ...,
         {"role": "assistant", "content": "Question 2: How would you describe the difference between a SQL and NoSQL database, and when would you use each?"},
         {"role": "user", "content": "SQL is relational with tables and schemas. NoSQL is non-relational with documents or key-value pairs."}
       ]
     }
     ```
   * **Log output**: `Interview Turn Called. History Length: 4, num_answers: 2`
   * **Response**:
     * `feedback`: "Great answer! You showed good clarity and covered the key aspects of the question."
     * `next_message`: "Question 3: Can you explain how you handle concurrency or asynchronous tasks in your favorite programming language?"
     * `is_final`: `false`

4. **Turn 4**:
   * **Request**:
     ```json
     {
       "target_role": "Data Analyst",
       "history": [
         ...,
         {"role": "assistant", "content": "Question 3: Can you explain how you handle concurrency or asynchronous tasks in your favorite programming language?"},
         {"role": "user", "content": "In Python I use async/await keywords with asyncio module for cooperative multitasking."}
       ]
     }
     ```
   * **Log output**: `Interview Turn Called. History Length: 6, num_answers: 3`
   * **Response**:
     * `feedback`: "Great answer! You showed good clarity and covered the key aspects of the question."
     * `next_message`: "Question 4: What is your approach to writing clean, maintainable code, and what tools do you use for testing?"
     * `is_final`: `false`

5. **Turn 5**:
   * **Request**:
     ```json
     {
       "target_role": "Data Analyst",
       "history": [
         ...,
         {"role": "assistant", "content": "Question 4: What is your approach to writing clean, maintainable code, and what tools do you use for testing?"},
         {"role": "user", "content": "I follow PEP 8 styling rules, write meaningful docstrings, write unit tests using pytest, and check coverage."}
       ]
     }
     ```
   * **Log output**: `Interview Turn Called. History Length: 8, num_answers: 4`
   * **Response**:
     * `feedback`: "Great answer! You showed good clarity and covered the key aspects of the question."
     * `next_message`: "Question 5: Do you have any questions for us, or is there any specific project you'd like to highlight?"
     * `is_final`: `false`

6. **Turn 6 (Final Scorecard)**:
   * **Request**:
     ```json
     {
       "target_role": "Data Analyst",
       "history": [
         ...,
         {"role": "assistant", "content": "Question 5: Do you have any questions for us, or is there any specific project you'd like to highlight?"},
         {"role": "user", "content": "I built an Inventory Management system using Python tkinter which helps keep track of store stocks."}
       ]
     }
     ```
   * **Log output**: `Interview Turn Called. History Length: 10, num_answers: 5`
   * **Response**:
     * `feedback`: "Overall solid performance in answering the mock interview questions."
     * `next_message`: "### Mock Interview Scorecard\n\n**Strengths:**\n- Good understanding of core concepts.\n- Clear communication and structured reasoning.\n\n**Weaknesses/Gaps:**\n- Could expand more on design patterns and architectural tradeoffs.\n\n**Actionable Tips:**\n- Study system design patterns and practice mock coding problems."
     * `is_final`: `true`

