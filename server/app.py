import os
import json
import tempfile
import logging
import firebase_admin
import pyttsx3
from firebase_admin import credentials, auth
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from langchain_groq import ChatGroq
from langchain.prompts import SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate, MessagesPlaceholder
from dotenv import load_dotenv
from langchain.schema import AIMessage


# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
# Initialize Flask
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}})

# Initialize Firebase
cred = credentials.Certificate("firebase-key.json")  # Place your Firebase JSON here
firebase_admin.initialize_app(cred)

# Initialize Text-to-Speech
try:
    tts_engine = pyttsx3.init()
except Exception as e:
    logger.error(f"Error initializing TTS: {str(e)}")
    raise

# Initialize Chat Model
try:
    llm = ChatGroq(
        model=os.getenv("GROQ_MODEL", "mixtral-8x7b-32768"),
        api_key=os.getenv("GROQ_API_KEY")
    )
except Exception as e:
    logger.error(f"Error initializing ChatGroq model: {str(e)}")
    raise

# Define AI chat prompts
system_msg_template = SystemMessagePromptTemplate.from_template(
    template=os.getenv("SYSTEM_PROMPT", "You are a helpful AI assistant.")
)
human_msg_template = HumanMessagePromptTemplate.from_template(template="{input}")
prompt_template = ChatPromptTemplate.from_messages([
    system_msg_template,
    MessagesPlaceholder(variable_name="history"),
    human_msg_template
])

# In-memory chat history
chat_history = {}

def save_to_history(username, message):
    """Save messages to user chat history."""
    if username not in chat_history:
        chat_history[username] = []
    chat_history[username].append(message)
    if len(chat_history[username]) > 100:
        chat_history[username] = chat_history[username][-100:]

# Firebase Authentication Middleware
def firebase_auth_required(f):
    """Middleware to verify Firebase ID token."""
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid token"}), 401

        try:
            id_token = auth_header.split("Bearer ")[1]
            decoded_token = auth.verify_id_token(id_token)
            request.user = decoded_token  # Store user info
        except Exception as e:
            return jsonify({"error": str(e)}), 401

        return f(*args, **kwargs)
    return decorated_function

@app.route('/verify-token', methods=['POST'])
def verify_token():
    """Verify Firebase token from frontend."""
    try:
        data = request.get_json()
        id_token = data.get("id_token")

        if not id_token:
            return jsonify({"error": "Missing token"}), 400

        decoded_token = auth.verify_id_token(id_token)
        user_id = decoded_token["uid"]

        return jsonify({"message": "Token verified", "user_id": user_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 401

@app.route('/chat', methods=['POST'])
@firebase_auth_required
def chat():
    """AI Chat API using LangChain."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        query = data.get("query", "").strip()
        if not query:
            return jsonify({"error": "Query is required"}), 400

        # Customer service assistant prompt
        prompt = """You are Emma, a friendly and professional customer service representative at our company. Your role is to assist customers with their inquiries in a natural, conversational manner.

Essential Guidelines:
1. ALWAYS maintain a warm, empathetic, and human-like tone in your responses
2. Use natural language and occasional conversational expressions like "I understand how frustrating this must be" or "I'd be happy to help you with that"
3. ONLY answer questions that are related to the customer service information provided in the knowledge base
4. For any questions outside the scope of the provided customer service database:
   - Politely apologize
   - Explain that you can only assist with customer service-related inquiries
   - Guide them back to relevant topics
   - Example: "I apologize, but I can only assist with customer service-related questions about our products and services. Could you please let me know if you have any questions about [mention 2-3 relevant topics from your database]?"

Response Style:
- Begin responses with friendly greetings when appropriate
- Use "I" statements to sound more personal
- Show active listening by briefly acknowledging the customer's concern
- Keep responses clear and concise
- End interactions professionally and warmly

Remember:
- Never make up information
- Never attempt to answer questions outside your customer service knowledge base
- Always stay within the scope of your training data
- If unsure, ask for clarification rather than making assumptions

Example interaction:
Customer: "What's the weather like today?"
You: "I apologize, but I'm specifically here to help with customer service matters related to our products and services. I'd be happy to assist you with questions about our return policy, product features, or account management instead. What can I help you with?"""

        full_query = f"{prompt}\nUser: {query}\nEmma:"  # Combining the prompt with the user's query
        response = llm.invoke(input=full_query)

        logger.info(f"Response type: {type(response)}")
        logger.info(f"Response dir: {dir(response)}")  # Lists available methods/attributes

        # Convert AIMessage to string or dict if it's not already
        if isinstance(response, AIMessage):
            response = response.content  # Access the content directly

        save_to_history(request.user["uid"], {"role": "user", "content": query})
        save_to_history(request.user["uid"], {"role": "assistant", "content": response})

        return jsonify({"response": response})
    except Exception as e:
        logger.error(f"Chat error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500



@app.route('/tts', methods=['POST'])
@firebase_auth_required
def text_to_speech():
    """Convert text to speech and return a .wav file."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        text = data.get("text", "").strip()
        if not text:
            return jsonify({"error": "Text is required"}), 400

        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_file:
            tts_engine.save_to_file(text, temp_file.name)
            tts_engine.runAndWait()
            return send_file(temp_file.name, mimetype='audio/wav')
    except Exception as e:
        logger.error(f"TTS error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500
    finally:
        if 'temp_file' in locals():
            os.unlink(temp_file.name)

@app.route('/history', methods=['GET'])
@firebase_auth_required
def get_history():
    """Retrieve chat history."""
    try:
        return jsonify({"history": chat_history.get(request.user["uid"], [])})
    except Exception as e:
        logger.error(f"Get history error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

if __name__ == "__main__":
    app.run(
        debug=True, 
        host=os.getenv("HOST", "127.0.0.1"), 
        port=int(os.getenv("PORT", 5000))
    )


@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', 'http://localhost:5173')  # Correct port
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response

@app.before_request
def handle_preflight():
    """Handle preflight CORS requests."""
    if request.method == "OPTIONS":
        response = jsonify({"message": "Preflight request handled"})
        response.headers.add("Access-Control-Allow-Origin", "http://localhost:5173")  # Correct port
        response.headers.add("Access-Control-Allow-Headers", "Content-Type, Authorization")
        response.headers.add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        response.headers.add("Access-Control-Allow-Credentials", "true")
        return response
