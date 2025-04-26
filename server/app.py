import os
import json
import logging
import firebase_admin
from firebase_admin import credentials, auth, firestore
from flask import Flask, request, jsonify
from flask_cors import CORS
from langchain_groq import ChatGroq
from langchain.prompts import SystemMessagePromptTemplate, HumanMessagePromptTemplate, ChatPromptTemplate, MessagesPlaceholder
from dotenv import load_dotenv
from langchain.schema import AIMessage
from sentence_transformers import SentenceTransformer
from pinecone import Pinecone, ServerlessSpec
import re
from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime, timedelta

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}}, supports_credentials=True)

# Initialize Firebase
try:
    cred = credentials.Certificate("firebase-key.json")
    firebase_admin.initialize_app(cred)
    db = firestore.client()
except Exception as e:
    logger.error(f"Error initializing Firebase: {str(e)}")
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
    template=os.getenv("SYSTEM_PROMPT", '''You are Emma, a friendly and professional customer service representative at our company. Your role is to assist customers with their inquiries in a natural, conversational manner.

Essential Guidelines:
1. ALWAYS maintain a warm, empathetic, and human-like tone.
2. Use conversational expressions like "I understand how frustrating this must be" or "I'd be happy to help."
3. ONLY answer questions related to the customer service information in the knowledge base.
4. For issues requiring human intervention (e.g., repairs, product exchanges, technical support, billing inquiries):
   - Explain that the issue needs a human agent.
   - Fetch the user's details (first name, last name, address, contact number) from the database.
   - Present the details to the user in this format: "I have your details as: First Name: [First Name], Last Name: [Last Name], Address: [Address], Contact Number: [Contact Number]. Would you like to make any changes?"
   - If the user says no or does not want changes (e.g., "No", "Looks good", "Correct"), proceed to the next step.
   - If the user wants to change details, prompt for updated information in this format: "Please provide the updated details: First Name: [Your First Name], Last Name: [Your Last Name], Address: [Your Address], Contact Number: [Your Contact Number]"
   - After confirming details, ask for their preferred service time: "Please provide your preferred time for the service (e.g., 2025-04-25 10:00 AM)."
   - Once all details are confirmed, create the ticket with an appropriate issue title based on the issue type:
     - Use "Repair" for fixing-related issues (e.g., "My laptop won't turn on").
     - Use "Product Exchange" for exchange or defective product issues (e.g., "My phone is defective").
     - Use "Technical Support" for software or technical issues (e.g., "Software crashed").
     - Use "Billing Inquiry" for payment or billing issues (e.g., "Wrong charge on bill").
   - Generate a concise issue description (1-2 sentences) summarizing the user's issue in your own words, avoiding direct copying of the user's query.
   - Include the ticket details in the response with the generated description:
       ```
       TICKET_DETAILS: First Name: [First Name], Last Name: [Last Name], Address: [Address], Contact Number: [Contact Number], Issue Title: [Issue Title], Issue Description: [Issue Description], Scheduled Time: [Preferred Time]
       ```
   - Add the `<needs_ticket>` tag after the ticket block.
   - Example: "I have your details as: First Name: John, Last Name: Doe, Address: 123 Main St, Contact Number: 555-1234. Would you like to make any changes? <needs_details>"
   - If user responds "No": "Please provide your preferred time for the service (e.g., 2025-04-25 10:00 AM). <needs_time>"
   - After time is provided: "Thank you! A ticket is being created. TICKET_DETAILS: First Name: John, Last Name: Doe, Address: 123 Main St, Contact Number: 555-1234, Issue Title: Repair, Issue Description: Laptop failed to power on, Scheduled Time: 2025-04-25 10:00 AM <needs_ticket> Is there anything else I can help with?"
5. For resolvable issues, provide clear answers based on the knowledge base without ticket details or `<needs_ticket>`.

Response Style:
- Start with a greeting when appropriate.
- Use "I" statements for a personal tone.
- Acknowledge the customer's concern.
- Keep responses clear, concise, and professional.
- End warmly, e.g., "Is there anything else I can assist with?"

Remember:
- Never make up information or answer outside the knowledge base.
- If unsure, ask for clarification.
- Use `<needs_details>`, `<needs_time>`, and `<needs_ticket>` tags appropriately during the ticket creation process.
- Ensure ticket details, including issue title and a concise LLM-generated description, are included in the response for unresolvable issues.

Example Interaction:
Customer: "My laptop won't turn on."
You: "I'm so sorry your laptop isn't working! That sounds like it needs a technician. I have your details as: First Name: [First Name], Last Name: [Last Name], Address: [Address], Contact Number: [Contact Number]. Would you like to make any changes? <needs_details>"
Customer: "No"
You: "Please provide your preferred time for the service (e.g., 2025-04-25 10:00 AM). <needs_time>"
Customer: "2025-04-25 10:00 AM"
You: "Thank you! A ticket is being created. TICKET_DETAILS: First Name: [First Name], Last Name: [Last Name], Address: [Address], Contact Number: [Contact Number], Issue Title: Repair, Issue Description: Laptop failed to power on, Scheduled Time: 2025-04-25 10:00 AM <needs_ticket> Is there anything else I can help with?"

Example Resolvable Interaction:
Customer: "How do I reset my password?"
You: "I'd be happy to help! Go to our website, click 'Forgot Password,' and follow the instructions. Let me know if you need more help!"''')
)
human_msg_template = HumanMessagePromptTemplate.from_template(template="{input}")
prompt_template = ChatPromptTemplate.from_messages([
    system_msg_template,
    MessagesPlaceholder(variable_name="history"),
    human_msg_template
])

# In-memory chat history and last interaction timestamps
chat_history = {}
last_interaction = {}
ticket_details = {}

def save_to_history(username, message, needs_details=False, needs_time=False, needs_ticket=False, ticket_info=None):
    """Save messages to user chat history and update ticket details."""
    if username not in chat_history:
        chat_history[username] = []
    chat_history[username].append(message)
    if len(chat_history[username]) > 100:
        chat_history[username] = chat_history[username][-100:]
    last_interaction[username] = datetime.now()
    logger.info(f"Saving to history for {username}, needs_details={needs_details}, needs_time={needs_time}, needs_ticket={needs_ticket}")
    if needs_details or needs_time or needs_ticket:
        ticket_details[username] = {
            "needs_details": bool(needs_details),
            "needs_time": bool(needs_time),
            "needs_ticket": bool(needs_ticket),
            "ticket_info": ticket_info
        }
    logger.info(f"Updated ticket_details for {username}: {ticket_details.get(username)}")

# Firebase Authentication Middleware
def firebase_auth_required(f):
    from functools import wraps
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid token"}), 401
        try:
            id_token = auth_header.split("Bearer ")[1]
            decoded_token = auth.verify_id_token(id_token)
            request.user = decoded_token
        except Exception as e:
            return jsonify({"error": str(e)}), 401
        return f(*args, **kwargs)
    return decorated_function

# Initialize Pinecone
try:
    embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
    pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))
    index_name = "test3"
    if index_name not in pc.list_indexes().names():
        pc.create_index(
            name=index_name, 
            dimension=384,
            metric='euclidean',
            spec=ServerlessSpec(cloud='aws', region='us-west-2')
        )
    index = pc.Index(index_name)
except Exception as e:
    logger.error(f"Error initializing Pinecone or SentenceTransformer: {str(e)}")
    raise

def find_match(input_text):
    """Retrieve the most relevant context from Pinecone."""
    try:
        input_embedding = embedding_model.encode(input_text).tolist()
        logger.info(f"Querying Pinecone with embedding of length: {len(input_embedding)}")
        result = index.query(vector=input_embedding, top_k=2, include_metadata=True)
        if len(result["matches"]) >= 2:
            return result["matches"][0]["metadata"]["text"] + "\n" + result["matches"][1]["metadata"]["text"]
        elif len(result["matches"]) == 1:
            return result["matches"][0]["metadata"]["text"]
        else:
            return "No relevant context found."
    except Exception as e:
        logger.error(f"Error in find_match: {str(e)}")
        raise

# Chat endpoint with ticket flagging
@app.route('/chat', methods=['POST'])
@firebase_auth_required
def chat():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        query = data.get("query", "").strip()
        if not query:
            return jsonify({"error": "Query is required"}), 400
        context = find_match(query)
        user_id = request.user["uid"]
        history = chat_history.get(user_id, [])
        formatted_history = []
        for msg in history:
            if msg["role"] == "user":
                formatted_history.append({"role": "user", "content": msg["content"]})
            elif msg["role"] == "assistant":
                formatted_history.append({"role": "assistant", "content": msg["content"]})
        input_with_context = f"Context from knowledge base: {context}\n\nUser query: {query}"
        prompt = prompt_template.format(
            history=formatted_history,
            input=input_with_context
        )
        response = llm.invoke(prompt)
        if isinstance(response, AIMessage):
            response = response.content

        # Remove <think> sections
        think_pattern = r'<think\b[^>]*>.*?</think>'
        removed_content = re.findall(think_pattern, response, re.DOTALL)
        if removed_content:
            logger.info(f"Removed think sections: {removed_content}")
        response = re.sub(think_pattern, '', response, flags=re.DOTALL).strip()

        # Check for ticket-related tags
        needs_details = '<needs_details>' in response
        needs_time = '<needs_time>' in response
        needs_ticket = '<needs_ticket>' in response
        ticket_state = ticket_details.get(user_id, {})
        logger.info(f"Initial ticket state for {user_id}: needs_details={ticket_state.get('needs_details', False)}, needs_time={ticket_state.get('needs_time', False)}, needs_ticket={ticket_state.get('needs_ticket', False)}")

        ticket_info = None
        if needs_details:
            logger.info(f"Entering needs_details block for query: {query}")
            response = response.replace('<needs_details>', '').strip()
            user_ref = db.collection("chat_saves").document(user_id)
            user_doc = user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                logger.info(f"Fetched user data for {user_id}: {user_data}")
                # Determine issue title based on query
                issue_title = "General Issue"
                if any(keyword in query.lower() for keyword in ["fix", "repair", "won't turn on", "broken"]):
                    issue_title = "Repair"
                elif any(keyword in query.lower() for keyword in ["exchange", "defective", "defect", "faulty"]):
                    issue_title = "Product Exchange"
                elif any(keyword in query.lower() for keyword in ["software", "crashed", "technical", "error"]):
                    issue_title = "Technical Support"
                elif any(keyword in query.lower() for keyword in ["bill", "charge", "payment", "billing"]):
                    issue_title = "Billing Inquiry"
                # Temporary description; will be updated by LLM later
                ticket_info = {
                    "first_name": user_data.get("firstName", "Unknown First Name"),
                    "last_name": user_data.get("lastName", "Unknown Last Name"),
                    "address": user_data.get("address", "Unknown Address"),
                    "contact_no": user_data.get("contactNo", "Unknown Contact Number"),
                    "issue_title": issue_title,
                    "issue_description": "Temporary description"  # Placeholder
                }
            else:
                logger.warning(f"No user data found for {user_id}, using default values")
                issue_title = "General Issue"
                if any(keyword in query.lower() for keyword in ["fix", "repair", "won't turn on", "broken"]):
                    issue_title = "Repair"
                elif any(keyword in query.lower() for keyword in ["exchange", "defective", "defect", "faulty"]):
                    issue_title = "Product Exchange"
                elif any(keyword in query.lower() for keyword in ["software", "crashed", "technical", "error"]):
                    issue_title = "Technical Support"
                elif any(keyword in query.lower() for keyword in ["bill", "charge", "payment", "billing"]):
                    issue_title = "Billing Inquiry"
                ticket_info = {
                    "first_name": "Unknown First Name",
                    "last_name": "Unknown Last Name",
                    "address": "Unknown Address",
                    "contact_no": "Unknown Contact Number",
                    "issue_title": issue_title,
                    "issue_description": "Temporary description"
                }
            # Replace placeholders in the response with actual user details
            # Handle variations in placeholder format (e.g., [First Name], [first name], etc.)
            response = re.sub(r'\[First Name\]', ticket_info["first_name"], response, flags=re.IGNORECASE)
            response = re.sub(r'\[Last Name\]', ticket_info["last_name"], response, flags=re.IGNORECASE)
            response = re.sub(r'\[Address\]', ticket_info["address"], response, flags=re.IGNORECASE)
            response = re.sub(r'\[Contact Number\]', ticket_info["contact_no"], response, flags=re.IGNORECASE)
            logger.info(f"Response after placeholder replacement: {response}")
            
            save_to_history(user_id, {"role": "user", "content": query}, needs_details=True, ticket_info=ticket_info)
            save_to_history(user_id, {"role": "assistant", "content": response}, needs_details=True, ticket_info=ticket_info)
            return jsonify({"response": response})

        elif ticket_state.get("needs_details", False) and not needs_time and not needs_ticket:
            logger.info(f"Processing needs_details confirmation for query: {query}")
            user_response = query.lower()
            if "no" in user_response or "correct" in user_response or "looks good" in user_response:
                response = "Please provide your preferred time for the service (e.g., 2025-04-25 10:00 AM). <needs_time>"
                save_to_history(user_id, {"role": "user", "content": query}, needs_time=True, ticket_info=ticket_state["ticket_info"])
                save_to_history(user_id, {"role": "assistant", "content": response}, needs_time=True, ticket_info=ticket_state["ticket_info"])
            else:
                response = "Please provide the updated details: First Name: [Your First Name], Last Name: [Your Last Name], Address: [Your Address], Contact Number: [Your Contact Number] <needs_details_update>"
                save_to_history(user_id, {"role": "user", "content": query}, needs_details=True, ticket_info=ticket_state["ticket_info"])
                save_to_history(user_id, {"role": "assistant", "content": response}, needs_details=True, ticket_info=ticket_state["ticket_info"])
            return jsonify({"response": response})

        elif '<needs_details_update>' in response:
            response = response.replace('<needs_details_update>', '').strip()
            first_name_match = re.search(r'First Name:\s*([^\,]+)', query, re.IGNORECASE)
            last_name_match = re.search(r'Last Name:\s*([^\,]+)', query, re.IGNORECASE)
            address_match = re.search(r'Address:\s*([^\,]+)', query, re.IGNORECASE)
            contact_no_match = re.search(r'Contact Number:\s*([^\,]+)', query, re.IGNORECASE)

            ticket_info = ticket_state["ticket_info"]
            ticket_info["first_name"] = first_name_match.group(1).strip() if first_name_match else ticket_info["first_name"]
            ticket_info["last_name"] = last_name_match.group(1).strip() if last_name_match else ticket_info["last_name"]
            ticket_info["address"] = address_match.group(1).strip() if address_match else ticket_info["address"]
            ticket_info["contact_no"] = contact_no_match.group(1).strip() if contact_no_match else ticket_info["contact_no"]

            response = "Please provide your preferred time for the service (e.g., 2025-04-25 10:00 AM). <needs_time>"
            save_to_history(user_id, {"role": "user", "content": query}, needs_time=True, ticket_info=ticket_info)
            save_to_history(user_id, {"role": "assistant", "content": response}, needs_time=True, ticket_info=ticket_info)
            return jsonify({"response": response})

        elif needs_time or ticket_state.get("needs_time", False):
            logger.info(f"Processing needs_time for query: {query}")
            if needs_time:
                response = response.replace('<needs_time>', '').strip()
            time_match = re.search(r'\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}\s*(?:AM|PM)', query, re.IGNORECASE)
            if time_match:
                scheduled_time = time_match.group(0).strip()
                ticket_info = ticket_state["ticket_info"]
                ticket_info["scheduled_time"] = scheduled_time
                
                # Generate issue description with LLM based on chat history
                user_query_history = [msg["content"] for msg in chat_history.get(user_id, []) if msg.get("role") == "user"]
                if user_query_history:
                    # Get the last 3 user messages for context
                    recent_queries = user_query_history[-3:]
                    description_prompt = f"Based on these user messages: {', '.join(recent_queries)}, provide a 1-2 sentence description of their issue."
                    try:
                        description_response = llm.invoke(
                            [{"role": "system", "content": "You are a helpful assistant that writes concise issue descriptions."},
                             {"role": "user", "content": description_prompt}]
                        )
                        if isinstance(description_response, AIMessage):
                            issue_description = description_response.content
                        else:
                            issue_description = description_response
                        
                        # Clean up the description - remove any think tags, quotation marks, extra spaces
                        issue_description = re.sub(r'<think\b[^>]*>.*?</think>', '', issue_description, flags=re.DOTALL)
                        issue_description = issue_description.replace('"', '').strip()
                        
                        # Limit description to 150 characters max
                        if len(issue_description) > 150:
                            issue_description = issue_description[:147] + "..."
                        
                        ticket_info["issue_description"] = issue_description
                        logger.info(f"Generated issue description: {issue_description}")
                    except Exception as e:
                        logger.error(f"Error generating issue description: {str(e)}")
                        ticket_info["issue_description"] = "Customer reported an issue with " + ticket_info["issue_title"].lower()
                else:
                    ticket_info["issue_description"] = "Customer reported an issue with " + ticket_info["issue_title"].lower()

                # Replace placeholders in the TICKET_DETAILS block
                response = re.sub(r'\[First Name\]', ticket_info["first_name"], response, flags=re.IGNORECASE)
                response = re.sub(r'\[Last Name\]', ticket_info["last_name"], response, flags=re.IGNORECASE)
                response = re.sub(r'\[Address\]', ticket_info["address"], response, flags=re.IGNORECASE)
                response = re.sub(r'\[Contact Number\]', ticket_info["contact_no"], response, flags=re.IGNORECASE)
                logger.info(f"Final response before sending to frontend: {response}")

                create_ticket_directly(user_id, ticket_info)
                response = (
                    f"Thank you! A ticket is being created. "
                    f"TICKET_DETAILS: First Name: {ticket_info['first_name']}, "
                    f"Last Name: {ticket_info['last_name']}, "
                    f"Address: {ticket_info['address']}, "
                    f"Contact Number: {ticket_info['contact_no']}, "
                    f"Issue Title: {ticket_info['issue_title']}, "
                    f"Issue Description: {ticket_info['issue_description']}, "
                    f"Scheduled Time: {scheduled_time} <needs_ticket>"
                )
                save_to_history(user_id, {"role": "user", "content": query}, needs_ticket=True, ticket_info=ticket_info)
                save_to_history(user_id, {"role": "assistant", "content": response}, needs_ticket=True, ticket_info=ticket_info)
            else:
                response = "Please provide a valid time format (e.g., 2025-04-25 10:00 AM). <needs_time>"
                save_to_history(user_id, {"role": "user", "content": query}, needs_time=True, ticket_info=ticket_state["ticket_info"])
                save_to_history(user_id, {"role": "assistant", "content": response}, needs_time=True, ticket_info=ticket_state["ticket_info"])
            return jsonify({"response": response})

        save_to_history(user_id, {"role": "user", "content": query})
        save_to_history(user_id, {"role": "assistant", "content": response})
        return jsonify({"response": response})
    except Exception as e:
        logger.error(f"Chat endpoint error: {str(e)}", exc_info=True)
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

# History endpoint
@app.route('/history', methods=['GET'])
@firebase_auth_required
def get_history():
    try:
        return jsonify({"history": chat_history.get(request.user["uid"], [])})
    except Exception as e:
        logger.error(f"Get history error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

# Endpoint to retrieve tickets
@app.route('/get_tickets', methods=['GET'])
@firebase_auth_required
def get_tickets():
    try:
        user_id = request.user["uid"]
        tickets_ref = db.collection("tickets").where("user_id", "==", user_id)
        tickets = tickets_ref.stream()
        ticket_list = [
            {
                "id": ticket.id,
                **ticket.to_dict()
            } for ticket in tickets
        ]
        return jsonify({"tickets": ticket_list})
    except Exception as e:
        logger.error(f"Get tickets error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500

# Create ticket directly with provided details
def create_ticket_directly(user_id, ticket_info):
    try:
        user_ref = db.collection("chat_saves").document(user_id)
        user_doc = user_ref.get()
        
        created_at = datetime.now()
        deadline = created_at + timedelta(hours=72)

        ticket_data = {
            "user_id": user_id,
            "first_name": ticket_info.get("first_name", ""),
            "last_name": ticket_info.get("last_name", ""),
            "address": ticket_info.get("address", ""),
            "contact_no": ticket_info.get("contact_no", ""),
            "issue_title": ticket_info.get("issue_title", "General Issue"),
            "issue_description": ticket_info.get("issue_description", "Unspecified issue"),
            "scheduled_time": ticket_info.get("scheduled_time", (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d %I:%M %p")),
            "status": "Open",
            "created_at": created_at.isoformat(),
            "deadline": deadline.isoformat()
        }
        
        if user_doc.exists:
            ticket_data["user_role"] = user_doc.to_dict().get("role")
            
        new_ticket = db.collection("tickets").add(ticket_data)
        logger.info(f"Created ticket for user {user_id}: {ticket_data}")
        
        chat_history[user_id] = []
        if user_id in last_interaction:
            del last_interaction[user_id]
        if user_id in ticket_details:
            del ticket_details[user_id]
            
        return new_ticket[1].id
    except Exception as e:
        logger.error(f"Error creating ticket for user {user_id}: {str(e)}")
        raise

# Background task to delete expired tickets
def delete_expired_tickets():
    try:
        now = datetime.now()
        tickets_ref = db.collection("tickets")
        tickets = tickets_ref.stream()
        for ticket in tickets:
            ticket_data = ticket.to_dict()
            if "deadline" in ticket_data:
                deadline = datetime.fromisoformat(ticket_data["deadline"])
                if now > deadline:
                    tickets_ref.document(ticket.id).delete()
                    logger.info(f"Deleted expired ticket {ticket.id} for user {ticket_data['user_id']}")
    except Exception as e:
        logger.error(f"Error deleting expired tickets: {str(e)}")

scheduler = BackgroundScheduler()
scheduler.add_job(delete_expired_tickets, 'interval', seconds=60)
scheduler.start()

@app.route('/api/update-ticket-status', methods=['POST'])
@firebase_auth_required
def update_ticket_status():
    try:
        data = request.get_json()
        if not data or 'ticket_id' not in data or 'status' not in data:
            return jsonify({"error": "Missing required fields"}), 400

        ticket_ref = db.collection("tickets").document(data['ticket_id'])
        ticket_ref.update({
            "status": data['status'],
            "last_updated": datetime.now().isoformat()
        })

        return jsonify({"message": "Ticket status updated successfully"})
    except Exception as e:
        logger.error(f"Error updating ticket status: {str(e)}")
        return jsonify({"error": "Failed to update ticket status"}), 500

if __name__ == "__main__":
    try:
        app.run(
            debug=True,
            host=os.getenv("HOST", "127.0.0.1"),
            port=int(os.getenv("PORT", 5000))
        )
    finally:
        scheduler.shutdown()