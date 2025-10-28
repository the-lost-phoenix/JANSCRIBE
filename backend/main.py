import os
import google.generativeai as genai
# We do NOT import 'Part' to avoid library version issues
from fastapi import FastAPI, File, UploadFile, Depends, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from dotenv import load_dotenv
from supabase import create_client, Client
import mimetypes

# --- 1. Load Environment Variables & Initialize API Clients ---
load_dotenv()

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Google Gemini (using the correct model name)
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
gemini_model = genai.GenerativeModel('gemini-2.5-flash')

# FastAPI App
app = FastAPI(title="JanScribe Backend")

# --- 2. Configure CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 3. Authentication Dependency ---
bearer_scheme = HTTPBearer()

def get_user_from_token(token: str = Depends(bearer_scheme)):
    """Validates a Supabase auth token and returns the user object."""
    try:
        user_data = supabase.auth.get_user(token.credentials)
        if user_data.user:
            return user_data.user
        else:
            raise HTTPException(status_code=401, detail="Invalid auth token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth error: {str(e)}")

# --- 4. The Main AI Processing Endpoint (Gemini-Only Version) ---
@app.post("/process-audio/")
async def process_audio(
    file: UploadFile = File(...),
    client_name: str = Form(None),
    user = Depends(get_user_from_token)
):
    """
    Transcribes, translates, summarizes, and saves the audio using only Gemini.
    """
    try:
        user_id = user.id

        # --- Step 1: Prepare Audio Blob Dictionary ---
        audio_data = await file.read()
        
        mime_type = file.content_type
        if not mime_type:
            # Guess mime type if not provided (e.g., 'audio/webm')
            mime_type = mimetypes.guess_type(file.filename or 'audio.webm')[0] or 'application/octet-stream' # Fallback needed

        # Create the audio part as a raw dictionary (Bypasses import issues)
        audio_part = {
            "mime_type": mime_type,
            "data": audio_data
        }
        
        # --- Step 2: Transcribe with Gemini (Pass 1) ---
        transcription_prompt = """
        Please transcribe the attached audio file accurately.
        The audio may be in English, Kannada, Tulu, Hindi, or a mix of languages.
        Provide ONLY the raw, full transcription of all spoken words. Do not add any extra commentary.
        """
        
        # Send the prompt AND the audio part dictionary in ONE call
        transcription_response = gemini_model.generate_content([transcription_prompt, audio_part])
        
        # Add robust error checking for Gemini response format
        try:
             original_transcript = transcription_response.text
        except ValueError:
             # Handle cases where the response might not contain 'text' directly (e.g., safety blocks)
             print(f"Warning: Could not extract transcription text directly. Full Gemini response: {transcription_response.candidates}")
             if transcription_response.candidates and transcription_response.candidates[0].content.parts:
                 original_transcript = "".join(part.text for part in transcription_response.candidates[0].content.parts)
             else:
                 raise HTTPException(status_code=500, detail="Gemini transcription failed or returned an unexpected format.")
        except Exception as e: # Catch any other unexpected errors during text extraction
            raise HTTPException(status_code=500, detail=f"Error extracting transcription: {str(e)}")


        # Check if transcript is empty or just noise
        if not original_transcript or len(original_transcript.split()) < 2: 
            raise HTTPException(status_code=400, detail="Audio was silent or could not be transcribed reliably by Gemini.")

        # --- Step 3: Translate & Summarize with Gemini (Pass 2) ---
        
        # Prompt for clean PDFs without markdown
        summarization_prompt = f"""
        You are an expert professional assistant (like a doctor's or lawyer's scribe).
        Your task is to process the following transcript.

        1.  First, translate the entire transcript into fluent, professional English.
        2.  Second, analyze the English translation and generate a structured, concise summary.
        
        **IMPORTANT FORMATTING RULES:**
        3.  Format the summary as **plain text only**.
        4.  Use **ALL CAPS** for headings (e.g., CHIEF COMPLAINT, HISTORY).
        5.  **Do NOT use any markdown characters** like `*`, `#`, or `_`. The output must be clean text for a PDF report.
        
        Transcript: "{original_transcript}"

        Structured English Summary:
        """
        
        summarization_response = gemini_model.generate_content(summarization_prompt)
        
        # Add robust error checking for summarization response
        try:
             structured_summary = summarization_response.text
        except ValueError:
             print(f"Warning: Could not extract summary text directly. Full Gemini response: {summarization_response.candidates}")
             if summarization_response.candidates and summarization_response.candidates[0].content.parts:
                 structured_summary = "".join(part.text for part in summarization_response.candidates[0].content.parts)
             else:
                 raise HTTPException(status_code=500, detail="Gemini summarization failed or returned an unexpected format.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error extracting summary: {str(e)}")


        # --- Step 4: Save to Supabase ---
        db_data = {
            "user_id": user_id,
            "original_transcript": original_transcript,
            "structured_summary": structured_summary,
            "client_name": client_name
        }
        supabase.table("summaries").insert(db_data).execute()

        # --- Step 5: Return the Final Summary ---
        
        return {"structured_summary": structured_summary}

    except HTTPException as http_exc: # Re-raise HTTP exceptions directly
        raise http_exc
    except Exception as e:
        # Provide more specific error detail if available
        error_detail = getattr(e, 'detail', str(e))
        print(f"ERROR processing audio: {error_detail}") # Log the error server-side
        raise HTTPException(status_code=500, detail=f"An error occurred: {error_detail}")

@app.get("/")
def read_root():
    return {"message": "JanScribe Backend is running!"}