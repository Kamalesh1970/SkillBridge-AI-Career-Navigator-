import os
import json
import logging
import chromadb
from chromadb.utils import embedding_functions

logger = logging.getLogger(__name__)

# Paths
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROLES_FILE = os.path.join(BASE_DIR, "data", "job_roles.json")
DB_PATH = os.path.join(BASE_DIR, ".chroma_db")

# Initialize Embedding Function (Local)
embedding_fn = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)

# Initialize ChromaDB Client (Persistent)
chroma_client = chromadb.PersistentClient(path=DB_PATH)

def initialize_database():
    """
    Loads job roles from json and seeds the Chroma collection on startup.
    Recreates the collection to ensure it always starts with fresh, correct data.
    """
    try:
        # Check if json file exists
        if not os.path.exists(ROLES_FILE):
            logger.error(f"Seeding dataset not found at {ROLES_FILE}")
            return
            
        with open(ROLES_FILE, "r") as f:
            roles = json.load(f)
            
        # Recreate collection
        try:
            chroma_client.delete_collection("job_roles")
            logger.info("Deleted existing 'job_roles' collection to refresh.")
        except Exception:
            pass
            
        collection = chroma_client.create_collection(
            name="job_roles",
            embedding_function=embedding_fn
        )
        
        # Insert documents
        ids = []
        documents = []
        metadatas = []
        
        for index, role in enumerate(roles):
            title = role["title"]
            ids.append(f"role_{index}")
            documents.append(role["sample_JD_text"])
            metadatas.append({
                "title": title,
                "required_skills": json.dumps(role["required_skills"]),
                "nice_to_have_skills": json.dumps(role["nice_to_have_skills"]),
                "typical_interview_questions": json.dumps(role["typical_interview_questions"])
            })
            
        collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas
        )
        logger.info(f"Successfully seeded {len(roles)} job roles into ChromaDB.")
        
    except Exception as e:
        logger.error(f"Error seeding ChromaDB: {str(e)}")

def get_role_by_title(title: str) -> dict:
    """
    Retrieves the role data by filtering ChromaDB metadata for the matching title.
    """
    collection = chroma_client.get_collection("job_roles", embedding_function=embedding_fn)
    results = collection.get(
        where={"title": title}
    )
    
    if results and results["metadatas"] and len(results["metadatas"]) > 0:
        metadata = results["metadatas"][0]
        # Parse fields back
        return {
            "title": metadata["title"],
            "required_skills": json.loads(metadata["required_skills"]),
            "nice_to_have_skills": json.loads(metadata["nice_to_have_skills"]),
            "typical_interview_questions": json.loads(metadata["typical_interview_questions"]),
            "sample_JD_text": results["documents"][0]
        }
    return None

def query_roles_by_text(query_text: str, limit: int = 1) -> list:
    """
    Queries ChromaDB semantically using a text query.
    """
    collection = chroma_client.get_collection("job_roles", embedding_function=embedding_fn)
    results = collection.query(
        query_texts=[query_text],
        n_results=limit
    )
    
    roles = []
    if results and results["metadatas"] and len(results["metadatas"][0]) > 0:
        for idx in range(len(results["metadatas"][0])):
            metadata = results["metadatas"][0][idx]
            document = results["documents"][0][idx]
            roles.append({
                "title": metadata["title"],
                "required_skills": json.loads(metadata["required_skills"]),
                "nice_to_have_skills": json.loads(metadata["nice_to_have_skills"]),
                "typical_interview_questions": json.loads(metadata["typical_interview_questions"]),
                "sample_JD_text": document
            })
    return roles
