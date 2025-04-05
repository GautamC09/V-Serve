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
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec


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
        model=os.getenv("GROQ_MODEL", "qwen-qwq-32b"),
        api_key=os.getenv("GROQ_API_KEY")
    )
except Exception as e:
    logger.error(f"Error initializing ChatGroq model: {str(e)}")
    raise

# Define AI chat prompts
system_msg_template = SystemMessagePromptTemplate.from_template(
    template=os.getenv("SYSTEM_PROMPT",''' "You are Emma, a friendly and professional customer service representative at our company. Your role is to assist customers with their inquiries in a natural, conversational manner.
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
                                        You: "I apologize, but I'm specifically here to help with customer service matters related to our products and services. I'd be happy to assist you with questions about our return policy, product features, or account management instead. What can I help you with?"''')
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

embedding_model = SentenceTransformer('all-MiniLM-L6-v2')

# Load environment variables
load_dotenv()

# Initialize Pinecone
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Check if the index exists, otherwise use the existing one
index_name = "test3"
if index_name not in pc.list_indexes().names():
    pc.create_index(
        name=index_name, 
        dimension=1536, 
        metric='euclidean',
        spec=ServerlessSpec(cloud='aws', region='us-west-2')
    )

# Access the Pinecone index
index = pc.Index(index_name)

def find_match(input_text):
    """Retrieve the most relevant context from Pinecone."""
    input_embedding = embedding_model.encode(input_text).tolist()
    result = index.query(vector=input_embedding, top_k=2, include_metadata=True)
    
    # Ensure there are at least 2 matches
    if len(result["matches"]) >= 2:
        return result["matches"][0]["metadata"]["text"] + "\n" + result["matches"][1]["metadata"]["text"]
    elif len(result["matches"]) == 1:
        return result["matches"][0]["metadata"]["text"]
    else:
        return "No relevant context found."

@app.route('/chat', methods=['POST'])
@firebase_auth_required
def chat():
    """AI Chat API using LangChain with Pinecone-based RAG."""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        query = data.get("query", "").strip()
        if not query:
            return jsonify({"error": "Query is required"}), 400

        # Retrieve relevant context from Pinecone
        context = find_match(query)

        # Construct the prompt with retrieved context
        full_query = f'''"Use the following context to answer the question: "You are Emma, a friendly and professional customer service representative at our company. Your role is to assist customers with their inquiries in a natural, conversational manner.
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
                                        You: "I apologize, but I'm specifically here to help with customer service matters related to our products and services. I'd be happy to assist you with questions about our return policy, product features, or account management instead. What can I help you with?"\n\n{context}\n\nUser: {query}\nAI:"'''

        # Get AI response using LangChain
        response = llm.invoke(input=full_query)

        # Convert AIMessage to string if necessary
        if isinstance(response, AIMessage):
            response = response.content

        # Save chat history
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
