import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

# Set mock env var to pass initialization import check
import os
os.environ["ANTHROPIC_API_KEY"] = "mock_key_for_testing"

from app.main import app

client = TestClient(app)

def test_get_roles():
    """
    Test /roles returns a valid list of seeded job role titles.
    """
    response = client.get("/roles")
    assert response.status_code == 200
    roles = response.json()
    assert isinstance(roles, list)
    assert len(roles) > 0
    assert "Data Analyst" in roles
    assert "ML Engineer" in roles

@patch("app.main.call_llm_json")
def test_extract_skills(mock_call_llm_json):
    """
    Test /analyze/extract-skills with mock LLM parsing.
    """
    mock_call_llm_json.return_value = {
        "skills": ["Python", "SQL", "React"],
        "projects": ["Personal CRM", "Data Dash"],
        "experience_level": "Entry-level"
    }

    response = client.post("/analyze/extract-skills", data={"resume_text": "Experienced Python dev with React knowledge"})
    assert response.status_code == 200
    data = response.json()
    assert "skills" in data
    assert "projects" in data
    assert "experience_level" in data
    assert data["skills"] == ["Python", "SQL", "React"]
    assert data["experience_level"] == "Entry-level"

@patch("app.main.call_llm_json")
def test_gap_analysis(mock_call_llm_json):
    """
    Test /analyze/gap with mock LLM comparison.
    """
    mock_call_llm_json.return_value = {
        "matched_skills": ["SQL", "Python", "Excel"],
        "missing_skills": ["Statistics"],
        "partial_skills": ["Data Visualization"],
        "match_percentage": 60.0,
        "summary_text": "Candidate has solid coding skills but lacks statistical basics.",
        "reasoning": {
            "SQL": "SQL is present.",
            "Python": "Python is present.",
            "Excel": "Excel is present.",
            "Statistics": "Missing stats.",
            "Data Visualization": "Partial visualization."
        }
    }

    response = client.post("/analyze/gap", json={
        "skills": ["Python", "SQL", "Excel"],
        "target_role": "Data Analyst"
    })
    
    assert response.status_code == 200
    data = response.json()
    # Check all key variants to verify schema compliance
    assert "matched" in data
    assert "matched_skills" in data
    assert "missing" in data
    assert "missing_skills" in data
    assert "partial" in data
    assert "partial_skills" in data
    assert "match_pct" in data
    assert "match_percentage" in data
    assert "summary" in data
    assert "summary_text" in data
    
    assert data["match_pct"] == 60.0
    assert data["matched"] == ["SQL", "Python", "Excel"]

@patch("app.main.call_llm_json")
def test_learning_path(mock_call_llm_json):
    """
    Test /learning-path endpoint.
    """
    mock_call_llm_json.return_value = {
        "roadmap": [
            {
                "skill": "Statistics",
                "why_it_matters": "Core to analyzing data insights.",
                "learning_time": "2 weeks",
                "resources": [
                    {"label": "Khan Academy", "url": "https://www.khanacademy.org"},
                    {"label": "OpenIntro Statistics", "url": "https://www.openintro.org"}
                ]
            }
        ]
    }

    response = client.post("/learning-path", json={
        "missing_skills": ["Statistics"],
        "partial_skills": [],
        "target_role": "Data Analyst"
    })

    assert response.status_code == 200
    data = response.json()
    assert "roadmap" in data
    assert len(data["roadmap"]) == 1
    assert data["roadmap"][0]["skill"] == "Statistics"
    assert data["roadmap"][0]["learning_time"] == "2 weeks"

@patch("app.main.call_llm_raw")
def test_interview_turn_start(mock_call_llm_raw):
    """
    Test /interview/turn initial call (empty history) returns the first question.
    """
    mock_call_llm_raw.return_value = "What is the difference between LEFT JOIN and INNER JOIN?"

    response = client.post("/interview/turn", json={
        "target_role": "Data Analyst",
        "history": []
    })

    assert response.status_code == 200
    data = response.json()
    assert data["next_message"] == "What is the difference between LEFT JOIN and INNER JOIN?"
    assert data["is_final"] is False
    assert data["feedback"] is None

@patch("app.main.call_llm_json")
def test_interview_turn_middle(mock_call_llm_json):
    """
    Test /interview/turn with mid-interview history (1 answer submitted).
    """
    mock_call_llm_json.return_value = {
        "feedback": "Good answer on joins.",
        "next_message": "How do you handle missing data?",
        "is_final": False
    }

    history = [
        {"role": "assistant", "content": "What is the difference between LEFT JOIN and INNER JOIN?"},
        {"role": "user", "content": "Left join keeps all rows from left table."}
    ]

    response = client.post("/interview/turn", json={
        "target_role": "Data Analyst",
        "history": history
    })

    assert response.status_code == 200
    data = response.json()
    assert data["feedback"] == "Good answer on joins."
    assert data["next_message"] == "How do you handle missing data?"
    assert data["is_final"] is False

@patch("app.main.call_llm_json")
def test_interview_turn_final(mock_call_llm_json):
    """
    Test /interview/turn with final answer history (5 answers submitted).
    """
    mock_call_llm_json.return_value = {
        "feedback": "Excellent response.",
        "next_message": "### Mock Interview Scorecard\n\n**Strengths:** Good joins\n**Weaknesses:** None\n**Actionable Tips:** Keep practicing.",
        "is_final": True
    }

    history = [
        {"role": "assistant", "content": "Q1"}, {"role": "user", "content": "A1"},
        {"role": "assistant", "content": "Q2"}, {"role": "user", "content": "A2"},
        {"role": "assistant", "content": "Q3"}, {"role": "user", "content": "A3"},
        {"role": "assistant", "content": "Q4"}, {"role": "user", "content": "A4"},
        {"role": "assistant", "content": "Q5"}, {"role": "user", "content": "A5"}
    ]

    response = client.post("/interview/turn", json={
        "target_role": "Data Analyst",
        "history": history
    })

    assert response.status_code == 200
    data = response.json()
    assert data["is_final"] is True
    assert "Scorecard" in data["next_message"]
    assert data["feedback"] == "Excellent response."
