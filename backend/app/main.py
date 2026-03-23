from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import requests
from bs4 import BeautifulSoup
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from dotenv import load_dotenv, find_dotenv

# Try to find .env.local first, then fallback to .env
load_dotenv(find_dotenv(".env.local"))
load_dotenv(find_dotenv(".env"))

app = FastAPI(title="Blog Posting Assistant API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

# --- SUPABASE HTTP HELPERS ---
def get_supabase_headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

def update_user_style(user_id: str, style_prompt: str, sample_texts: str):
    url = f"{SUPABASE_URL}/rest/v1/user_styles"
    data = {"user_id": user_id, "style_prompt": style_prompt, "sample_texts": sample_texts}
    response = requests.post(url, headers=get_supabase_headers(), json=data)
    # If the user already has a style, we might want to PATCH instead depending on DB policies.
    # For MVP, assuming insertion or upsertion.
    if response.status_code not in (200, 201):
        # Attempt PATCH if conflict
        patch_url = f"{SUPABASE_URL}/rest/v1/user_styles?user_id=eq.{user_id}"
        requests.patch(patch_url, headers=get_supabase_headers(), json=data)

def get_user_style(user_id: str) -> str:
    url = f"{SUPABASE_URL}/rest/v1/user_styles?user_id=eq.{user_id}&select=style_prompt"
    response = requests.get(url, headers=get_supabase_headers())
    if response.status_code == 200 and len(response.json()) > 0:
        return response.json()[0].get('style_prompt', '')
    return ""

def save_generated_post(user_id: str, image_url: str, generated_content: str):
    url = f"{SUPABASE_URL}/rest/v1/posts"
    data = {
        "user_id": user_id,
        "image_url": image_url,
        "generated_content": generated_content
    }
    response = requests.post(url, headers=get_supabase_headers(), json=data)
    if response.status_code in (200, 201):
        return response.json()[0].get('id')
    return None

# --- API MODELS ---
class StyleRequest(BaseModel):
    blog_url: str
    user_id: str

class GenerateRequest(BaseModel):
    image_url: str
    user_id: str

class FeedbackRequest(BaseModel):
    post_id: str
    user_id: str
    final_content: str
    original_content: str

# --- ROUTES ---
@app.get("/")
def read_root():
    return {"message": "API is running"}

@app.post("/api/v1/style/extract")
def extract_style(req: StyleRequest):
    if not GOOGLE_API_KEY:
         raise HTTPException(status_code=500, detail="Gemini API Key missing")
         
    # 1. Scrape blog text
    try:
        res = requests.get(req.blog_url, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')
        texts = soup.find_all(['p', 'article', 'div'])
        sample_text = " ".join([t.get_text() for t in texts])[:5000] # Limiting size for prompt
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to scrape blog: {str(e)}")

    # 2. Extract style using Gemini
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=GOOGLE_API_KEY)
    prompt = PromptTemplate(
        input_variables=["sample"],
        template="Analyze the following blog text and create a detailed stylistic persona profile. Focus on tone, wording, sentence structure, formatting habits, and general vibe. Provide ONLY the precise stylistic instructions (a 'System Prompt' to be used for future generation).\n\nText:\n{sample}"
    )
    
    chain = prompt | llm
    style_prompt = chain.invoke({"sample": sample_text}).content
    
    # 3. Save to Supabase
    update_user_style(req.user_id, style_prompt, sample_text)
    
    return {"status": "success", "style_prompt": style_prompt}

@app.post("/api/v1/post/generate")
def generate_post(req: GenerateRequest):
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=500, detail="Gemini API Key missing")
        
    style_prompt = get_user_style(req.user_id)
    if not style_prompt:
        style_prompt = "Write a friendly, engaging blog post." # Fallback
        
    # Using Gemini Vision capabilities (passing image via URL in langchain is tricky, we use dict format)
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=GOOGLE_API_KEY)
    
    # In langchain_google_genai, we can pass image URLs in human message
    from langchain_core.messages import HumanMessage
    
    message = HumanMessage(
        content=[
            {
                "type": "text", 
                "text": f"You are a blog writer. Write a new post about this image. ALL output MUST be strictly in KOREAN (한국어). MUST stringently follow this style guide:\n<style_guide>\n{style_prompt}\n</style_guide>\n"
            },
            {
                "type": "image_url",
                "image_url": req.image_url
            }
        ]
    )
    
    response = llm.invoke([message])
    generated_text = response.content
    
    # Save to Supabase
    post_id = save_generated_post(req.user_id, req.image_url, generated_text)
    
    return {"status": "success", "post_id": post_id, "content": generated_text}

def analyze_and_update_style_background(user_id: str, original: str, final: str):
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=GOOGLE_API_KEY)
    
    prompt = f"""
    The following is an original AI-generated text and the final text modified by the user.
    Original:
    {original}
    
    Final by User:
    {final}
    
    Analyze the difference to see how the user prefers to write. 
    Output an updated style guideline that incorporates these new preferences along with their general style.
    Do not output anything besides the updated guidelines.
    """
    
    updated_style = llm.invoke(prompt).content
    update_user_style(user_id, updated_style, "updated via feedback")

@app.put("/api/v1/style/feedback")
def style_feedback(req: FeedbackRequest, background_tasks: BackgroundTasks):
    url = f"{SUPABASE_URL}/rest/v1/posts?id=eq.{req.post_id}"
    data = {"final_content": req.final_content}
    requests.patch(url, headers=get_supabase_headers(), json=data)
    
    # Kick off background task to refine persona
    background_tasks.add_task(analyze_and_update_style_background, req.user_id, req.original_content, req.final_content)
    
    return {"status": "success", "message": "Feedback received and persona is updating"}
