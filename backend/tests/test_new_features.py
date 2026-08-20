import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
import json
import os

# Set mock env var to pass initialization import check
os.environ["ANTHROPIC_API_KEY"] = "mock_key_for_testing"

from app.main import app
from app.llm import detect_meta_request, extract_skills_from_text_via_taxonomy
from app.main import normalize_merged_words

client = TestClient(app)

def test_detect_meta_request():
    """
    Test that meta-redirect questions are properly identified.
    """
    assert detect_meta_request("ask me about Python") == "python"
    assert detect_meta_request("can we focus on machine learning") == "machine learning"
    assert detect_meta_request("skip this and talk about RAG") == "rag"
    assert detect_meta_request("I don't know, ask something else") == "another technical topic related to the role"
    assert detect_meta_request("An inner join is a database query...") is None

def test_taxonomy_extraction():
    """
    Test that taxonomy extraction accurately identifies and extracts skills.
    """
    resume_text = (
        "Project: Building RAG systems with FastAPI and FAISS.\n"
        "We also used PaddleOCR for parsing documents, and CLIP for multimodal models.\n"
        "Implemented in py with torch."
    )
    skills = extract_skills_from_text_via_taxonomy(resume_text)
    assert "FastAPI" in skills
    assert "FAISS" in skills
    assert "RAG" in skills
    assert "PaddleOCR" in skills
    assert "CLIP" in skills
    assert "Python" in skills  # Matches 'py'
    assert "PyTorch" in skills  # Matches 'torch'
    
    # Check that unrelated skills are not matched
    assert "Java" not in skills
    assert "React" not in skills

def test_custom_role_gap_analysis():
    """
    Test that gap-analysis correctly processes custom roles.
    """
    response = client.post("/analyze/gap", json={
        "skills": ["Python", "Docker", "Git"],
        "target_role": "Other (custom) - Site Reliability Engineer"
    })
    assert response.status_code == 200
    data = response.json()
    assert "matched" in data
    assert "missing" in data
    assert "partial" in data
    assert "match_percentage" in data
    assert "AI-inferred estimate" in data["summary_text"]

def test_custom_role_interview_first_question():
    """
    Test that starting an interview with a custom role generates dynamic estimation.
    """
    response = client.post("/interview/turn", json={
        "target_role": "Other (custom) - Site Reliability Engineer",
        "history": [],
        "candidate_skills": ["Python", "Linux"]
    })
    assert response.status_code == 200
    data = response.json()
    assert "Welcome! Let's begin the mock interview for the Other (custom) - Site Reliability Engineer position." in data["next_message"]
    assert data["is_final"] is False

def test_normalize_merged_words():
    """
    Test that fused/merged words are correctly split and protected terms are preserved.
    """
    # 1. camelCase protected terms must not split internally
    assert normalize_merged_words("PyTorch") == "PyTorch"
    assert normalize_merged_words("FastAPI") == "FastAPI"
    assert normalize_merged_words("TensorFlow") == "TensorFlow"
    
    # 2. Fused words with protected terms must split correctly
    assert normalize_merged_words("VQA SystemFastAPI") == "VQA System FastAPI"
    assert normalize_merged_words("SystemFastAPI, FAISS, CLIP") == "System FastAPI, FAISS, CLIP"
    
    # 3. Fused words with acronyms
    assert normalize_merged_words("to-endMultimodal RAGsystem") == "to-end Multimodal RAG system"
    
    # 4. Spacing artifacts like "F AISS" cleaned to "FAISS"
    assert normalize_merged_words("VQA SystemFastAPI, F AISS, CLIP") == "VQA System FastAPI, FAISS, CLIP"
